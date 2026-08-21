import type { DokployServiceType } from "./types";

export const SERVICE_METADATA = {
  applications: { label: "Application", kind: "application" },
  compose: { label: "Compose", kind: "application" },
  postgres: { label: "PostgreSQL", kind: "database" },
  mysql: { label: "MySQL", kind: "database" },
  mariadb: { label: "MariaDB", kind: "database" },
  mongo: { label: "MongoDB", kind: "database" },
  redis: { label: "Redis", kind: "database" },
} as const satisfies Record<
  DokployServiceType,
  { label: string; kind: "application" | "database" }
>;

export function isDatabaseService(type: DokployServiceType) {
  return SERVICE_METADATA[type].kind === "database";
}

export function getServiceTypeLabel(type: DokployServiceType) {
  return SERVICE_METADATA[type].label;
}

export const SERVICE_ENDPOINTS: Record<
  DokployServiceType,
  { path: string; idParameter: string }
> = {
  applications: { path: "application", idParameter: "applicationId" },
  compose: { path: "compose", idParameter: "composeId" },
  postgres: { path: "postgres", idParameter: "postgresId" },
  mysql: { path: "mysql", idParameter: "mysqlId" },
  mariadb: { path: "mariadb", idParameter: "mariadbId" },
  mongo: { path: "mongo", idParameter: "mongoId" },
  redis: { path: "redis", idParameter: "redisId" },
};
