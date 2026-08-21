import { getServiceTypeLabel } from "./constants";
import {
  DOKPLOY_SERVICE_TYPES,
  type DokployDeployment,
  type DokployDomain,
  type DokployEnvironment,
  type DokployProject,
  type DokployService,
  type DokployServiceStatus,
  type DokployServiceType,
  type JsonRecord,
} from "./types";

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function unwrapArray(value: unknown, ...fields: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];

  for (const field of fields) {
    if (Array.isArray(value[field])) return value[field];
  }
  return [];
}

export function containersFromResponse(value: unknown): JsonRecord[] {
  return unwrapArray(value, "containers", "data").filter(isRecord);
}

export function isContainerRunning(container: JsonRecord) {
  const state = stringValue(container.State ?? container.state).toLowerCase();
  const status = stringValue(
    container.Status ?? container.status,
  ).toLowerCase();
  return state === "running" || status.startsWith("up ") || status === "up";
}

export function normalizeServiceStatus(value: unknown): DokployServiceStatus {
  const status = stringValue(value).toLowerCase();
  if (status === "done" || status === "running-healthy") return "running";
  if (status === "running" || status === "deploying") return "deploying";
  return "down";
}

export function serviceStatus(service: JsonRecord, type: DokployServiceType) {
  const field = type === "compose" ? "composeStatus" : "applicationStatus";
  return normalizeServiceStatus(
    service[field] ?? service.status ?? service.state,
  );
}

function serviceId(service: JsonRecord, type: DokployServiceType) {
  const fields: Record<DokployServiceType, string> = {
    applications: "applicationId",
    compose: "composeId",
    postgres: "postgresId",
    mysql: "mysqlId",
    mariadb: "mariadbId",
    mongo: "mongoId",
    redis: "redisId",
  };
  return stringValue(service[fields[type]]);
}

export function databaseCredentials(
  service: JsonRecord,
  type: DokployServiceType,
  fallbackHost = "",
): DokployService["credentials"] {
  if (type === "applications" || type === "compose") return [];

  const host = stringValue(service.appName, fallbackHost);
  const user = stringValue(service.databaseUser);
  const password = stringValue(service.databasePassword);
  const databaseName = stringValue(service.databaseName);
  const port = {
    postgres: "5432",
    mysql: "3306",
    mariadb: "3306",
    mongo: "27017",
    redis: "6379",
  }[type];
  const protocol = {
    postgres: "postgresql",
    mysql: "mysql",
    mariadb: "mysql",
    mongo: "mongodb",
    redis: "redis",
  }[type];
  const authentication =
    type === "redis"
      ? password
        ? `:${encodeURIComponent(password)}@`
        : ""
      : user || password
        ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
        : "";
  const databasePath = databaseName
    ? `/${encodeURIComponent(databaseName)}`
    : "";
  const connectionUrl = host
    ? `${protocol}://${authentication}${host}:${port}${databasePath}`
    : "";

  return [
    user ? { label: "User", value: user } : null,
    password ? { label: "Password", value: password, secret: true } : null,
    databaseName ? { label: "Database Name", value: databaseName } : null,
    host ? { label: "Internal Host", value: host } : null,
    { label: "Internal Port", value: port },
    connectionUrl
      ? { label: "Internal Connection URL", value: connectionUrl, secret: true }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
}

export function normalizeServices(environment: JsonRecord) {
  return DOKPLOY_SERVICE_TYPES.flatMap((type) =>
    unwrapArray(environment[type]).flatMap((candidate): DokployService[] => {
      if (!isRecord(candidate)) return [];
      const id = serviceId(candidate, type);
      if (!id) return [];
      return [
        {
          id,
          name: stringValue(
            candidate.name,
            stringValue(
              candidate.databaseName,
              stringValue(candidate.appName, getServiceTypeLabel(type)),
            ),
          ),
          appName: stringValue(candidate.appName) || null,
          env: stringValue(candidate.env),
          serverId: stringValue(candidate.serverId) || null,
          type,
          status: serviceStatus(candidate, type),
          credentials: databaseCredentials(candidate, type),
        },
      ];
    }),
  );
}

export function normalizeProject(candidate: unknown): DokployProject | null {
  if (!isRecord(candidate)) return null;
  const projectId = stringValue(candidate.projectId);
  if (!projectId) return null;
  const environments = unwrapArray(candidate.environments).flatMap(
    (environment): DokployEnvironment[] => {
      if (!isRecord(environment)) return [];
      const environmentId = stringValue(environment.environmentId);
      if (!environmentId) return [];
      return [
        {
          environmentId,
          name: stringValue(environment.name, "Unnamed environment"),
          services: normalizeServices(environment),
        },
      ];
    },
  );
  return {
    projectId,
    name: stringValue(candidate.name, "Unnamed project"),
    description:
      typeof candidate.description === "string" ? candidate.description : null,
    createdAt: stringValue(candidate.createdAt),
    env: stringValue(candidate.env),
    environments,
  };
}

export function normalizeDeployments(payload: unknown): DokployDeployment[] {
  return unwrapArray(payload, "data", "deployments").flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const deploymentId = stringValue(candidate.deploymentId);
    if (!deploymentId) return [];
    return [
      {
        deploymentId,
        title: stringValue(candidate.title, "Deployment"),
        description:
          typeof candidate.description === "string"
            ? candidate.description
            : null,
        status: stringValue(
          candidate.status,
          stringValue(candidate.deploymentStatus, "unknown"),
        ),
        createdAt: stringValue(candidate.createdAt),
      },
    ];
  });
}

export function normalizeDomains(payload: unknown): DokployDomain[] {
  return unwrapArray(payload, "data").flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const domainId = stringValue(candidate.domainId);
    const host = stringValue(candidate.host);
    if (!domainId || !host) return [];
    return [
      {
        domainId,
        host,
        port: typeof candidate.port === "number" ? candidate.port : 3000,
        https: candidate.https === true,
        letsEncrypt: candidate.certificateType === "letsencrypt",
        serviceName: stringValue(candidate.serviceName),
        enabled: candidate.enabled !== false,
      },
    ];
  });
}
