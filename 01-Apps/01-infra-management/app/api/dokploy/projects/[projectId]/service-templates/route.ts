import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { createApplicationAction } from "@/app/(dashboard)/dokploy/_actions/applications";
import { createComposeAction } from "@/app/(dashboard)/dokploy/_actions/composes";
import { createDatabaseAction } from "@/app/(dashboard)/dokploy/_actions/databases";
import type { ActionState } from "@/app/(dashboard)/dokploy/_actions/shared";
import {
  getActiveDokployConfiguration,
  getDokployProject,
  getFreshDokployProject,
  isValidHostname,
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
  updateDokployProjectEnv,
} from "@/lib/dokploy";
import { configureVendureBackups } from "@/lib/dokploy/vendure-backups";
import { getVendureBackendZotImage } from "@/lib/zot/vendure-backend-image";
import { getVendureStorefrontZotImage } from "@/lib/zot/vendure-storefront-image";

const initialState: ActionState = { status: "idle", message: "" };
const REPOSITORY_OWNER = "AlexandruDanCroitoriu";
const REPOSITORY_NAME = "vps-dockploy-setup";
const REPOSITORY_BRANCH = "main";
const VENDURE_BACKEND_PATH = "/01-Apps/02-Online-Store-Vendure/apps/server";
const VENDURE_STOREFRONT_PATHS = [
  "/01-Apps/02-Online-Store-Vendure/apps/storefront-clean",
  "/01-Apps/02-Online-Store-Vendure/apps/storefront",
] as const;

type CreatedTemplateService = NonNullable<ActionState["createdService"]> & {
  name: string;
};

function password() {
  return randomBytes(24).toString("base64url");
}

function databaseForm(type: "postgres" | "redis", environmentId: string) {
  const formData = new FormData();
  formData.set("type", type);
  formData.set("environmentId", environmentId);
  formData.set("name", type);
  formData.set("databasePassword", password());
  formData.set("deployAfterCreate", "on");
  if (type === "postgres") {
    formData.set("databaseName", "postgres");
    formData.set("databaseUser", "postgres");
  }
  return formData;
}

function vendureApplicationForm(input: {
  environmentId: string;
  buildPath: string;
  channelToken: string;
  backendId?: string;
}) {
  const formData = new FormData();
  formData.set("name", "vendure");
  formData.set("environmentId", input.environmentId);
  formData.set("owner", REPOSITORY_OWNER);
  formData.set("repository", REPOSITORY_NAME);
  formData.set("branch", REPOSITORY_BRANCH);
  formData.set("buildPath", input.buildPath);
  formData.set("buildType", "dockerfile");
  formData.set("port", "3000");
  formData.set("https", "on");
  formData.set("deployAfterCreate", "on");
  formData.set("vendureChannelToken", input.channelToken);
  if (input.backendId) {
    formData.set("vendureBackendId", input.backendId);
    formData.set("vendureTemplateProvisioning", "on");
  }
  return formData;
}

function createdOrError(
  result: ActionState,
  name: string,
  created: CreatedTemplateService[],
  warnings: string[],
) {
  if (!result.createdService) return false;
  created.push({ ...result.createdService, name });
  if (result.status === "error") warnings.push(result.message);
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const payload = (await request.json().catch(() => null)) as {
    templateId?: string;
    garageCapacityGb?: number;
    garageS3Host?: string;
    garageS3HostProvider?: string;
    r2BackupBucket?: string;
    r2BackupPrefix?: string;
    r2BackupTime?: string;
  } | null;
  if (
    payload?.templateId !== "postgres-redis-dbgate" &&
    payload?.templateId !== "vendure-stack"
  ) {
    return Response.json(
      { error: "Invalid service template." },
      { status: 400 },
    );
  }
  const garageCapacityGb = payload.garageCapacityGb ?? 20;
  const r2BackupBucket = payload.r2BackupBucket?.trim() ?? "";
  const r2BackupPrefix = payload.r2BackupPrefix?.trim() ?? "";
  const r2BackupTime = payload.r2BackupTime?.trim() ?? "";
  if (
    !Number.isSafeInteger(garageCapacityGb) ||
    garageCapacityGb < 1 ||
    garageCapacityGb > 1_000_000
  ) {
    return Response.json(
      {
        error: "Garage capacity must be a whole number from 1 to 1,000,000 GB.",
      },
      { status: 400 },
    );
  }

  const project = await getDokployProject(projectId);
  const environment = project?.environments[0];
  if (!project || !environment) {
    return Response.json(
      { error: "The project has no default environment." },
      { status: 409 },
    );
  }

  const existingTypes = new Set(
    environment.services.map((service) => service.type),
  );
  const hasDbGate = environment.services.some(
    (service) =>
      service.type === "compose" && service.name.toLowerCase() === "dbgate",
  );
  const hasGarage = environment.services.some(
    (service) =>
      service.type === "compose" &&
      ["garage", "garage with ui"].includes(service.name.toLowerCase()),
  );
  if (
    payload.templateId === "postgres-redis-dbgate" &&
    (existingTypes.has("postgres") ||
      existingTypes.has("redis") ||
      hasDbGate ||
      hasGarage)
  ) {
    return Response.json(
      {
        error:
          "This template requires PostgreSQL, Redis, DBGate, and Garage to be absent.",
      },
      { status: 409 },
    );
  }

  const configuration = await getActiveDokployConfiguration();
  const garageS3Host = (
    payload.garageS3Host ||
    (configuration?.rootDomain ? `s3.${configuration.rootDomain}` : "")
  )
    .trim()
    .toLowerCase();
  if (!isValidHostname(garageS3Host)) {
    return Response.json(
      { error: "Enter a valid Garage S3 API domain hostname." },
      { status: 400 },
    );
  }

  if (payload.templateId === "vendure-stack") {
    const hasVendureService = environment.services.some(
      (service) =>
        service.type === "postgres" ||
        (service.type === "compose" &&
          ["garage", "garage with ui"].includes(service.name.toLowerCase())) ||
        (service.type === "applications" &&
          [
            "vendure",
            "vendure-storefront",
            "vendure-storefront-clean",
          ].includes(service.name.toLowerCase())),
    );
    if (hasVendureService) {
      return Response.json(
        {
          error:
            "This template requires PostgreSQL, Garage, and all Vendure applications to be absent.",
        },
        { status: 409 },
      );
    }
    if (!configuration || !isValidHostname(configuration.rootDomain)) {
      return Response.json(
        { error: "Configure a valid instance root domain first." },
        { status: 409 },
      );
    }

    const [backendImage, ...storefrontImages] = await Promise.all([
      getVendureBackendZotImage(),
      ...VENDURE_STOREFRONT_PATHS.map((path) =>
        getVendureStorefrontZotImage(path),
      ),
    ]);
    const unavailableImage = [backendImage, ...storefrontImages].find(
      (image) => !image.available,
    );
    if (unavailableImage && !unavailableImage.available) {
      return Response.json(
        { error: unavailableImage.message },
        { status: 409 },
      );
    }

    const created: CreatedTemplateService[] = [];
    const warnings: string[] = [];
    const postgresResult = await createDatabaseAction(
      projectId,
      initialState,
      databaseForm("postgres", environment.environmentId),
    );
    if (!createdOrError(postgresResult, "postgres", created, warnings)) {
      return Response.json(
        { error: postgresResult.message, services: created },
        { status: 422 },
      );
    }
    const postgresProjectEnvironment =
      (await getFreshDokployProject(projectId))?.env ?? project.env;

    const garageForm = new FormData();
    garageForm.set("definitionId", "garage-with-webui");
    garageForm.set("garageCapacityGb", String(garageCapacityGb));
    garageForm.set("loginUsername", configuration.defaultServiceUsername);
    garageForm.set("loginPassword", configuration.defaultServicePassword);
    garageForm.set("host", `garage.${configuration.rootDomain}`);
    garageForm.set("s3Host", garageS3Host);
    garageForm.set(
      "s3HostProvider",
      payload.garageS3HostProvider ?? "cloudflare",
    );
    garageForm.set("deployAfterCreate", "on");
    if (r2BackupBucket) {
      garageForm.set("r2BackupBucket", r2BackupBucket);
      garageForm.set("r2BackupPrefix", r2BackupPrefix);
      garageForm.set("r2BackupTime", r2BackupTime);
    }
    const garageResult = await createComposeAction(
      projectId,
      environment.environmentId,
      initialState,
      garageForm,
    );
    if (!createdOrError(garageResult, "Garage with UI", created, warnings)) {
      return Response.json(
        { error: garageResult.message, services: created },
        { status: 422 },
      );
    }
    const garageProject = await getFreshDokployProject(projectId);
    if (garageProject) {
      await updateDokployProjectEnv(
        projectId,
        mergeDokployProjectEnv(
          garageProject.env,
          parseDokployEnvironmentEntries(postgresProjectEnvironment),
        ),
      );
      try {
        await configureVendureBackups({
          projectId,
          postgresId: postgresResult.createdService!.id,
          bucket: r2BackupBucket,
          prefix: r2BackupPrefix,
          backupTime: r2BackupTime || "03:00",
        });
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `Services were created, but automatic backups could not be configured: ${error.message}`
            : "Services were created, but automatic backups could not be configured.",
        );
      }
    } else {
      warnings.push(
        "Services were created, but automatic backups could not be configured because the refreshed project was unavailable.",
      );
    }

    const channelToken = randomBytes(24).toString("base64url");
    const backendResult = await createApplicationAction(
      projectId,
      initialState,
      vendureApplicationForm({
        environmentId: environment.environmentId,
        buildPath: VENDURE_BACKEND_PATH,
        channelToken,
      }),
    );
    if (!createdOrError(backendResult, "vendure", created, warnings)) {
      return Response.json(
        { error: backendResult.message, services: created },
        { status: 422 },
      );
    }

    for (const buildPath of VENDURE_STOREFRONT_PATHS) {
      const name = `vendure-${buildPath.split("/").at(-1)}`;
      const storefrontResult = await createApplicationAction(
        projectId,
        initialState,
        vendureApplicationForm({
          environmentId: environment.environmentId,
          buildPath,
          channelToken,
          backendId: backendResult.createdService!.id,
        }),
      );
      if (!createdOrError(storefrontResult, name, created, warnings)) {
        return Response.json(
          { error: storefrontResult.message, services: created },
          { status: 422 },
        );
      }
    }
    return Response.json({ services: created, warnings });
  }

  const created: CreatedTemplateService[] = [];
  const warnings: string[] = [];
  for (const type of ["postgres", "redis"] as const) {
    const result = await createDatabaseAction(
      projectId,
      initialState,
      databaseForm(type, environment.environmentId),
    );
    if (result.createdService) {
      created.push({ ...result.createdService, name: type });
      if (result.status === "error") warnings.push(result.message);
      continue;
    }
    return Response.json(
      { error: result.message, services: created },
      { status: 422 },
    );
  }

  const composeForm = new FormData();
  composeForm.set("definitionId", "dbgate");
  composeForm.set(
    "loginUsername",
    configuration?.defaultServiceUsername ?? "admin",
  );
  composeForm.set(
    "loginPassword",
    configuration?.defaultServicePassword ?? "admin",
  );
  if (configuration?.rootDomain) {
    composeForm.set("host", `dbgate.${configuration.rootDomain}`);
  }
  composeForm.set("deployAfterCreate", "on");
  const composeResult = await createComposeAction(
    projectId,
    environment.environmentId,
    initialState,
    composeForm,
  );
  if (composeResult.createdService) {
    created.push({ ...composeResult.createdService, name: "DBGate" });
    if (composeResult.status === "error") warnings.push(composeResult.message);
  } else {
    return Response.json(
      { error: composeResult.message, services: created },
      { status: 422 },
    );
  }

  const garageForm = new FormData();
  garageForm.set("definitionId", "garage-with-webui");
  garageForm.set("garageCapacityGb", String(garageCapacityGb));
  garageForm.set(
    "loginUsername",
    configuration?.defaultServiceUsername ?? "admin",
  );
  garageForm.set(
    "loginPassword",
    configuration?.defaultServicePassword ?? password(),
  );
  if (configuration?.rootDomain) {
    garageForm.set("host", `garage.${configuration.rootDomain}`);
  }
  garageForm.set("s3Host", garageS3Host);
  garageForm.set(
    "s3HostProvider",
    payload.garageS3HostProvider ?? "cloudflare",
  );
  garageForm.set("deployAfterCreate", "on");
  if (r2BackupBucket) {
    garageForm.set("r2BackupBucket", r2BackupBucket);
    garageForm.set("r2BackupPrefix", r2BackupPrefix);
    garageForm.set("r2BackupTime", r2BackupTime);
  }
  const garageResult = await createComposeAction(
    projectId,
    environment.environmentId,
    initialState,
    garageForm,
  );
  if (garageResult.createdService) {
    created.push({ ...garageResult.createdService, name: "Garage with UI" });
    if (garageResult.status === "error") warnings.push(garageResult.message);
  } else {
    return Response.json(
      { error: garageResult.message, services: created },
      { status: 422 },
    );
  }

  return Response.json({ services: created, warnings });
}
