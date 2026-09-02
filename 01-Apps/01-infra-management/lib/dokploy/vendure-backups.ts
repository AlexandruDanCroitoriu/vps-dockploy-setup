import "server-only";

import { dokployGetFresh, dokployPost } from "./client";
import { getFreshDokployProjects } from "./projects";
import { R2_DESTINATION_PREFIX } from "./r2-destinations";
import { isRecord, stringValue, unwrapArray } from "./normalizers";
import { getActiveDokployConfiguration } from "./active-instance";
import {
  getCloudflareR2S3Credentials,
  getCloudflareR2S3Endpoint,
} from "@/lib/cloudflare/r2";
import {
  getPostgresRestoreState,
  savePostgresRestoreState,
} from "@/lib/storage/postgres-restore-state";
import { runVpsCommand } from "@/lib/vps/ssh-command";

const KEEP_LATEST_COUNT = 30;

export type VendureBackupOverview = {
  configured: boolean;
  jobs: Array<{
    id: string;
    projectName: string;
    name: string;
    target: "R2";
    schedule: string;
    enabled: boolean;
  }>;
  r2Files: Array<{
    key: string;
    size: number | null;
    modifiedAt: string;
  }>;
  error: string;
};

export type GarageBackupConfiguration = {
  bucket: string;
  prefix: string;
  time: string;
  configured: boolean;
};

export type PostgresBackupConfiguration = {
  bucket: string;
  prefix: string;
  time: string;
  configured: boolean;
  recoveryPoints: PostgresRecoveryPoint[];
};

export type PostgresRecoveryPoint = {
  key: string;
  size: number | null;
  modifiedAt: string;
  current: boolean;
  returnPoint: boolean;
};

function payloadRecord(payload: unknown) {
  const candidate =
    isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  return isRecord(candidate) ? candidate : null;
}

async function destinations() {
  const payload = await dokployGetFresh<unknown>("destination.all");
  return unwrapArray(payload, "data", "destinations").filter(isRecord);
}

async function getComposeAppName(composeId: string) {
  const compose = payloadRecord(
    await dokployGetFresh<unknown>(
      `compose.one?${new URLSearchParams({ composeId })}`,
    ),
  );
  const appName = stringValue(compose?.appName);
  if (!appName) throw new Error("Dokploy did not return the Garage app name.");
  return appName;
}

export async function configureVendureBackups(input: {
  projectId: string;
  postgresId: string;
  bucket: string;
  prefix: string;
  backupTime?: string;
}) {
  if (!input.postgresId) {
    throw new Error("The PostgreSQL service is missing.");
  }
  const prefix = input.prefix.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.length > 200 || !/^[a-zA-Z0-9/_-]+$/.test(prefix)) {
    throw new Error("Enter a valid R2 backup folder.");
  }
  const backupTime = input.backupTime || "03:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(backupTime)) {
    throw new Error("Choose a valid daily backup time.");
  }
  const [garageHour, garageMinute] = backupTime.split(":").map(Number);
  await configurePostgresR2Backup({
    postgresId: input.postgresId,
    bucket: input.bucket,
    prefix: `${prefix}/postgres`,
    time: `${String((garageHour + 23) % 24).padStart(2, "0")}:${String(garageMinute).padStart(2, "0")}`,
  });
}

export async function configurePostgresR2Backup(input: {
  postgresId: string;
  bucket: string;
  prefix: string;
  time: string;
}) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    throw new Error("Choose a valid daily backup time.");
  }
  const prefix = input.prefix.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.length > 200 || !/^[a-zA-Z0-9/_-]+$/.test(prefix)) {
    throw new Error("Enter a valid R2 backup folder.");
  }
  const destination = (await destinations()).find(
    (candidate) =>
      stringValue(candidate.name) === `${R2_DESTINATION_PREFIX}${input.bucket}`,
  );
  const destinationId = stringValue(destination?.destinationId);
  if (!destinationId) {
    throw new Error("Synchronize the selected R2 bucket to Dokploy first.");
  }
  const payload = await dokployGetFresh<unknown>(
    `postgres.one?${new URLSearchParams({ postgresId: input.postgresId })}`,
  );
  const existing = records(payload, "backups")[0];
  const [hour, minute] = input.time.split(":").map(Number);
  const body = {
    schedule: `${minute} ${hour} * * *`,
    enabled: true,
    prefix,
    destinationId,
    keepLatestCount: KEEP_LATEST_COUNT,
    database: "postgres",
    postgresId: input.postgresId,
    databaseType: "postgres",
    backupType: "database",
  };
  const id = existing ? backupId(existing) : "";
  await dokployPost(
    id ? "backup.update" : "backup.create",
    id
      ? {
          ...body,
          backupId: id,
          serviceName:
            typeof existing.serviceName === "string"
              ? existing.serviceName
              : null,
          metadata: isRecord(existing.metadata) ? existing.metadata : {},
        }
      : body,
  );
}

export async function getPostgresBackupConfiguration(
  postgresId: string,
): Promise<PostgresBackupConfiguration> {
  const [payload, allDestinations, instance] = await Promise.all([
    dokployGetFresh<unknown>(
      `postgres.one?${new URLSearchParams({ postgresId })}`,
    ),
    destinations(),
    getActiveDokployConfiguration(),
  ]);
  const backup = records(payload, "backups")[0];
  if (!backup) {
    return {
      bucket: "",
      prefix: "postgres",
      time: "02:00",
      configured: false,
      recoveryPoints: [],
    };
  }
  const destinationId = stringValue(backup.destinationId);
  const destination = allDestinations.find(
    (candidate) => stringValue(candidate.destinationId) === destinationId,
  );
  const name = stringValue(destination?.name);
  const prefix = stringValue(backup.prefix, "postgres");
  const files = destinationId
    ? await listPostgresBackupFiles(destinationId, prefix)
    : [];
  const state = instance
    ? getPostgresRestoreState(instance.id, postgresId)
    : { currentBackupKey: "", returnBackupKey: "" };
  return {
    bucket: name.startsWith(R2_DESTINATION_PREFIX)
      ? name.slice(R2_DESTINATION_PREFIX.length)
      : "",
    prefix,
    time: cronTime(stringValue(backup.schedule)) || "02:00",
    configured: true,
    recoveryPoints: files.map((file, index) => ({
      ...file,
      current: state.currentBackupKey
        ? file.key === state.currentBackupKey
        : index === 0,
      returnPoint: file.key === state.returnBackupKey,
    })),
  };
}

async function listPostgresBackupFiles(destinationId: string, prefix: string) {
  const payload = await dokployGetFresh<unknown>(
    `backup.listBackupFiles?${new URLSearchParams({ destinationId, search: prefix })}`,
  ).catch(() => []);
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const normalizedPrefix = `${cleanPrefix}/`;
  return records(payload, "files", "contents", "Contents", "data")
    .map((file) => {
      const returnedKey = stringValue(
        file.key,
        stringValue(
          file.Key,
          stringValue(
            file.path,
            stringValue(
              file.Path,
              stringValue(file.name, stringValue(file.Name)),
            ),
          ),
        ),
      ).replace(/^\/+/, "");
      return {
        key: returnedKey.startsWith(normalizedPrefix)
          ? returnedKey
          : `${normalizedPrefix}${returnedKey}`,
        size:
          typeof (file.size ?? file.Size) === "number"
            ? Number(file.size ?? file.Size)
            : null,
        modifiedAt: stringValue(
          file.lastModified,
          stringValue(
            file.LastModified,
            stringValue(
              file.modifiedAt,
              stringValue(file.ModTime, stringValue(file.createdAt)),
            ),
          ),
        ),
      };
    })
    .filter((file) => file.key !== normalizedPrefix && !file.key.endsWith("/"))
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export async function restorePostgresBackup(input: {
  postgresId: string;
  backupKey: string;
}) {
  const instance = await getActiveDokployConfiguration();
  if (!instance?.vpsIp || !instance.vpsPassword) {
    throw new Error(
      "Add the VPS IP address and root password to this Dokploy instance first.",
    );
  }
  const [payload, allDestinations] = await Promise.all([
    dokployGetFresh<unknown>(
      `postgres.one?${new URLSearchParams({ postgresId: input.postgresId })}`,
    ),
    destinations(),
  ]);
  const database = payloadRecord(payload);
  const backup = records(payload, "backups")[0];
  if (!database || !backup)
    throw new Error("Configure the PostgreSQL backup first.");
  const destinationId = stringValue(backup.destinationId);
  const destination = allDestinations.find(
    (item) => stringValue(item.destinationId) === destinationId,
  );
  const destinationName = stringValue(destination?.name);
  const bucket = destinationName.startsWith(R2_DESTINATION_PREFIX)
    ? destinationName.slice(R2_DESTINATION_PREFIX.length)
    : "";
  const prefix = stringValue(backup.prefix);
  const before = await listPostgresBackupFiles(destinationId, prefix);
  if (!bucket || !before.some((file) => file.key === input.backupKey)) {
    throw new Error(
      "The selected recovery point is not available in this database backup folder.",
    );
  }
  const previousState = getPostgresRestoreState(instance.id, input.postgresId);
  const returning = previousState.returnBackupKey === input.backupKey;
  let returnBackupKey = previousState.returnBackupKey;
  if (!returning) {
    await runPostgresBackupManually(input.postgresId);
    const after = await listPostgresBackupFiles(destinationId, prefix);
    returnBackupKey =
      after.find((file) => !before.some((old) => old.key === file.key))?.key ??
      "";
    if (!returnBackupKey) {
      throw new Error(
        "A safety backup could not be confirmed, so the restore was cancelled.",
      );
    }
  }
  const appName = stringValue(database.appName);
  const databaseName = stringValue(
    database.databaseName,
    stringValue(backup.database, "postgres"),
  );
  const databaseUser = stringValue(database.databaseUser, "postgres");
  if (!appName || !databaseName || !databaseUser)
    throw new Error("Dokploy did not return the PostgreSQL restore details.");
  const credentials = await getCloudflareR2S3Credentials();
  const endpoint = getCloudflareR2S3Endpoint();
  const serviceLabel = `com.docker.swarm.service.name=${appName}`;
  const remote = `:s3:${bucket}/${input.backupKey}`;
  const command = [
    "set -eu",
    `CONTAINER_ID=$(docker ps -q --filter ${shellQuote("status=running")} --filter ${shellQuote(`label=${serviceLabel}`)} | head -n 1)`,
    'test -n "$CONTAINER_ID"',
    `rclone cat --s3-provider Other --s3-access-key-id ${shellQuote(credentials.accessKeyId)} --s3-secret-access-key ${shellQuote(credentials.secretAccessKey)} --s3-endpoint ${shellQuote(endpoint)} --s3-region auto ${shellQuote(remote)} | gunzip | docker exec -e DB_NAME=${shellQuote(databaseName)} -e DB_USER=${shellQuote(databaseUser)} -i "$CONTAINER_ID" sh -c 'pg_restore -U "$DB_USER" -d "$DB_NAME" -O --clean --if-exists'`,
  ].join("\n");
  await runVpsCommand({
    ipAddress: instance.vpsIp,
    password: instance.vpsPassword,
    command,
  });
  savePostgresRestoreState({
    instanceId: instance.id,
    postgresId: input.postgresId,
    currentBackupKey: input.backupKey,
    returnBackupKey: returning ? "" : returnBackupKey,
  });
  return { returnedToPresent: returning };
}

export async function runPostgresBackupManually(postgresId: string) {
  const payload = await dokployGetFresh<unknown>(
    `postgres.one?${new URLSearchParams({ postgresId })}`,
  );
  const backup = records(payload, "backups")[0];
  const id = backup ? backupId(backup) : "";
  if (!id) throw new Error("Configure the PostgreSQL backup first.");
  await dokployPost("backup.manualBackupPostgres", { backupId: id });
}

function records(payload: unknown, ...fields: string[]) {
  const candidate = payloadRecord(payload) ?? payload;
  return unwrapArray(candidate, ...fields).filter(isRecord);
}

function backupId(value: Record<string, unknown>) {
  return stringValue(value.backupId);
}

function volumeBackupId(value: Record<string, unknown>) {
  return stringValue(value.volumeBackupId);
}

async function managedBackupResources() {
  const projects = await getFreshDokployProjects();
  const resources = await Promise.all(
    projects.flatMap((project) => {
      const services = project.environments.flatMap(
        (environment) => environment.services,
      );
      const postgres = services.find(
        (service) =>
          service.type === "postgres" &&
          service.name.toLowerCase() === "postgres",
      );
      const garage = services.find(
        (service) =>
          service.type === "compose" &&
          ["garage", "garage with ui"].includes(service.name.toLowerCase()),
      );
      if (!postgres || !garage) return [];
      return [
        Promise.all([
          dokployGetFresh<unknown>(
            `postgres.one?${new URLSearchParams({ postgresId: postgres.id })}`,
          ),
          dokployGetFresh<unknown>(
            `volumeBackups.list?${new URLSearchParams({ id: garage.id, volumeBackupType: "compose" })}`,
          ),
        ]).then(([postgresPayload, volumePayload]) => ({
          projectId: project.projectId,
          projectName: project.name,
          postgresBackups: records(postgresPayload, "backups"),
          volumeBackups: records(volumePayload, "volumeBackups", "data"),
        })),
      ];
    }),
  );
  return resources;
}

export async function getVendureBackupOverview(): Promise<VendureBackupOverview> {
  try {
    const [resources, allDestinations] = await Promise.all([
      managedBackupResources(),
      destinations(),
    ]);
    const r2 = allDestinations.find((destination) =>
      stringValue(destination.name).startsWith(R2_DESTINATION_PREFIX),
    );
    const r2DestinationId = stringValue(r2?.destinationId);
    const jobs = resources.flatMap((resource) => [
      ...resource.postgresBackups.flatMap((backup) => {
        const id = backupId(backup);
        const prefix = stringValue(backup.prefix);
        if (!id || !prefix.endsWith("/postgres")) return [];
        return [
          {
            id,
            projectName: resource.projectName,
            name: "PostgreSQL",
            target: "R2" as const,
            schedule: stringValue(backup.schedule),
            enabled: backup.enabled !== false,
          },
        ];
      }),
      ...resource.volumeBackups.flatMap((backup) => {
        const id = volumeBackupId(backup);
        if (
          !id ||
          !/_garage-(?:meta|data)$/.test(stringValue(backup.volumeName))
        )
          return [];
        return [
          {
            id,
            projectName: resource.projectName,
            name: stringValue(
              backup.name,
              stringValue(backup.volumeName, "Garage volume"),
            ),
            target: "R2" as const,
            schedule: stringValue(backup.cronExpression),
            enabled: backup.enabled !== false,
          },
        ];
      }),
    ]);

    let r2Files: VendureBackupOverview["r2Files"] = [];
    if (r2DestinationId) {
      const payload = await dokployGetFresh<unknown>(
        `backup.listBackupFiles?${new URLSearchParams({ destinationId: r2DestinationId, search: "" })}`,
      ).catch(() => []);
      r2Files = records(payload, "files", "contents", "Contents", "data")
        .map((file) => ({
          key: stringValue(
            file.key,
            stringValue(
              file.Key,
              stringValue(file.name, stringValue(file.path)),
            ),
          ),
          size:
            typeof (file.size ?? file.Size) === "number" &&
            Number.isFinite(file.size ?? file.Size)
              ? Number(file.size ?? file.Size)
              : null,
          modifiedAt: stringValue(
            file.lastModified,
            stringValue(
              file.LastModified,
              stringValue(file.modifiedAt, stringValue(file.createdAt)),
            ),
          ),
        }))
        .filter((file) => file.key)
        .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    }
    return { configured: jobs.length > 0, jobs, r2Files, error: "" };
  } catch (error) {
    return {
      configured: false,
      jobs: [],
      r2Files: [],
      error: error instanceof Error ? error.message : "Unable to load backups.",
    };
  }
}

export async function runVendureBackupsManually() {
  const resources = await managedBackupResources();
  let projectsBackedUp = 0;
  for (const resource of resources) {
    const postgres = resource.postgresBackups.find((backup) =>
      stringValue(backup.prefix).endsWith("/postgres"),
    );
    const volumes = resource.volumeBackups.filter((backup) =>
      /_garage-(?:meta|data)$/.test(stringValue(backup.volumeName)),
    );
    const postgresId = postgres ? backupId(postgres) : "";
    if (!postgresId || volumes.length !== 2) continue;

    await dokployPost("backup.manualBackupPostgres", {
      backupId: postgresId,
    });
    for (const volume of volumes) {
      await dokployPost("volumeBackups.runManually", {
        volumeBackupId: volumeBackupId(volume),
      });
    }
    projectsBackedUp += 1;
  }
  if (!projectsBackedUp) {
    throw new Error(
      "No complete managed Vendure backup configuration was found.",
    );
  }
  return projectsBackedUp;
}

export async function configureGarageR2VolumeBackups(input: {
  composeId: string;
  projectId?: string;
  bucket: string;
  prefix: string;
  time: string;
}) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    throw new Error("Choose a valid daily backup time.");
  }
  const prefix = input.prefix.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.length > 200 || !/^[a-zA-Z0-9/_-]+$/.test(prefix)) {
    throw new Error("Enter a valid R2 backup folder.");
  }
  const destination = (await destinations()).find(
    (candidate) =>
      stringValue(candidate.name) === `${R2_DESTINATION_PREFIX}${input.bucket}`,
  );
  const destinationId = stringValue(destination?.destinationId);
  if (!destinationId) {
    throw new Error("Synchronize the selected R2 bucket to Dokploy first.");
  }
  const appName = await getComposeAppName(input.composeId);
  const [hour, minute] = input.time.split(":");
  const cronExpression = `${Number(minute)} ${Number(hour)} * * *`;
  const existing = records(
    await dokployGetFresh<unknown>(
      `volumeBackups.list?${new URLSearchParams({ id: input.composeId, volumeBackupType: "compose" })}`,
    ),
    "volumeBackups",
    "data",
  );
  for (const volume of ["garage-meta", "garage-data"] as const) {
    const body = {
      name: `Garage ${volume} to ${input.bucket}`,
      volumeName: `${appName}_${volume}`,
      prefix: `${prefix}/${volume}`,
      serviceType: "compose",
      appName,
      serviceName: "garage",
      turnOff: true,
      cronExpression,
      keepLatestCount: KEEP_LATEST_COUNT,
      enabled: true,
      composeId: input.composeId,
      destinationId,
    };
    const current = existing.find(
      (backup) => stringValue(backup.volumeName) === body.volumeName,
    );
    const currentId = current ? volumeBackupId(current) : "";
    await dokployPost(
      currentId ? "volumeBackups.update" : "volumeBackups.create",
      currentId ? { ...body, volumeBackupId: currentId } : body,
    );
  }
  if (input.projectId) {
    const project = (await getFreshDokployProjects()).find(
      (candidate) => candidate.projectId === input.projectId,
    );
    const postgres = project?.environments
      .flatMap((environment) => environment.services)
      .find(
        (service) =>
          service.type === "postgres" &&
          service.name.toLowerCase() === "postgres",
      );
    if (postgres) {
      const payload = await dokployGetFresh<unknown>(
        `postgres.one?${new URLSearchParams({ postgresId: postgres.id })}`,
      );
      const backup = records(payload, "backups").find((candidate) =>
        stringValue(candidate.prefix).endsWith("/postgres"),
      );
      const id = backup ? backupId(backup) : "";
      if (backup && id) {
        const postgresHour = (Number(hour) + 23) % 24;
        await dokployPost("backup.update", {
          schedule: `${Number(minute)} ${postgresHour} * * *`,
          enabled: backup.enabled !== false,
          prefix: `${prefix}/postgres`,
          backupId: id,
          destinationId,
          database: stringValue(backup.database, "postgres"),
          keepLatestCount:
            typeof backup.keepLatestCount === "number"
              ? backup.keepLatestCount
              : KEEP_LATEST_COUNT,
          serviceName:
            typeof backup.serviceName === "string" ? backup.serviceName : null,
          metadata: isRecord(backup.metadata) ? backup.metadata : {},
          databaseType: "postgres",
        });
      }
    }
  }
}

function cronTime(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 5) return "";
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (
    !Number.isInteger(minute) ||
    !Number.isInteger(hour) ||
    minute < 0 ||
    minute > 59 ||
    hour < 0 ||
    hour > 23
  ) {
    return "";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export async function getGarageBackupConfiguration(
  composeId: string,
): Promise<GarageBackupConfiguration> {
  const [volumePayload, allDestinations] = await Promise.all([
    dokployGetFresh<unknown>(
      `volumeBackups.list?${new URLSearchParams({ id: composeId, volumeBackupType: "compose" })}`,
    ),
    destinations(),
  ]);
  const backups = records(volumePayload, "volumeBackups", "data");
  const backup = backups.find((candidate) =>
    stringValue(candidate.volumeName).endsWith("_garage-meta"),
  );
  if (!backup) {
    return { bucket: "", prefix: "garage", time: "03:00", configured: false };
  }
  const destinationId = stringValue(backup.destinationId);
  const destination = allDestinations.find(
    (candidate) => stringValue(candidate.destinationId) === destinationId,
  );
  const destinationName = stringValue(destination?.name);
  const prefix = stringValue(backup.prefix).replace(/\/garage-meta\/?$/, "");
  return {
    bucket: destinationName.startsWith(R2_DESTINATION_PREFIX)
      ? destinationName.slice(R2_DESTINATION_PREFIX.length)
      : "",
    prefix: prefix || "garage",
    time: cronTime(stringValue(backup.cronExpression)) || "03:00",
    configured: true,
  };
}

export async function runGarageBackupsManually(input: {
  projectId: string;
  composeId: string;
}) {
  const project = (await getFreshDokployProjects()).find(
    (candidate) => candidate.projectId === input.projectId,
  );
  const postgres = project?.environments
    .flatMap((environment) => environment.services)
    .find(
      (service) =>
        service.type === "postgres" &&
        service.name.toLowerCase() === "postgres",
    );
  if (postgres) {
    const payload = await dokployGetFresh<unknown>(
      `postgres.one?${new URLSearchParams({ postgresId: postgres.id })}`,
    );
    const backup = records(payload, "backups").find((candidate) =>
      stringValue(candidate.prefix).endsWith("/postgres"),
    );
    const id = backup ? backupId(backup) : "";
    if (id) await dokployPost("backup.manualBackupPostgres", { backupId: id });
  }
  const payload = await dokployGetFresh<unknown>(
    `volumeBackups.list?${new URLSearchParams({ id: input.composeId, volumeBackupType: "compose" })}`,
  );
  const backups = records(payload, "volumeBackups", "data").filter((backup) =>
    /_garage-(?:meta|data)$/.test(stringValue(backup.volumeName)),
  );
  if (backups.length !== 2) {
    throw new Error("Configure both Garage volume backups first.");
  }
  for (const backup of backups) {
    await dokployPost("volumeBackups.runManually", {
      volumeBackupId: volumeBackupId(backup),
    });
  }
}
