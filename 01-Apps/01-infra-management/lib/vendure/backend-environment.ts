import {
  parseDokployEnvironmentEntries,
  removeDokployProjectEnvEntries,
  type DokployService,
} from "@/lib/dokploy";

export class VendureBackendSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendureBackendSetupError";
  }
}

function credential(service: DokployService, label: string, fallback = "") {
  return (
    service.credentials.find((candidate) => candidate.label === label)?.value ??
    fallback
  );
}

export function getVendurePostgresEnvironment(
  projectEnvironment: string,
  services: readonly DokployService[],
) {
  const entries = parseDokployEnvironmentEntries(projectEnvironment);
  const postgres = services.find((service) => service.type === "postgres");
  const values = {
    DB_HOST:
      entries.POSTGRES_HOST ||
      entries.DB_HOST ||
      (postgres
        ? credential(postgres, "Internal Host", postgres.appName ?? "")
        : ""),
    DB_PORT:
      entries.POSTGRES_PORT ||
      entries.DB_PORT ||
      (postgres ? credential(postgres, "Internal Port", "5432") : ""),
    DB_NAME:
      entries.POSTGRES_DATABASE ||
      entries.POSTGRES_DB ||
      entries.DB_NAME ||
      (postgres ? credential(postgres, "Database Name") : ""),
    DB_USERNAME:
      entries.POSTGRES_USER ||
      entries.POSTGRES_USERNAME ||
      entries.DB_USERNAME ||
      (postgres ? credential(postgres, "User") : ""),
    DB_PASSWORD:
      entries.POSTGRES_PASSWORD ||
      entries.DB_PASSWORD ||
      (postgres ? credential(postgres, "Password") : ""),
    DB_SCHEMA: entries.POSTGRES_SCHEMA || entries.DB_SCHEMA || "public",
  };
  if (Object.values(values).some((value) => !value)) {
    throw new VendureBackendSetupError(
      "The project environment does not contain complete PostgreSQL internal credentials.",
    );
  }
  return values;
}

const VENDURE_STORAGE_ENVIRONMENT_KEYS = [
  "ASSET_URL_PREFIX",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

export function getVendureStorageEnvironment(projectEnvironment: string) {
  const entries = parseDokployEnvironmentEntries(projectEnvironment);
  return Object.fromEntries(
    VENDURE_STORAGE_ENVIRONMENT_KEYS.flatMap((key) =>
      entries[key] ? [[key, entries[key]]] : [],
    ),
  );
}

export const VENDURE_EMAIL_ENVIRONMENT_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USERNAME",
  "SMTP_PASSWORD",
  "MAIL_FROM_ADDRESS",
  "MAIL_FROM_NAME",
  "VENDURE_STOREFRONT_URL",
] as const;

const VENDURE_BACKEND_PATH = "/01-Apps/02-Online-Store-Vendure/apps/server";

export function isVendureBackendService(
  service: Pick<DokployService, "type" | "name" | "sourcePath">,
) {
  return (
    service.type === "applications" &&
    (service.name.toLowerCase() === "vendure" ||
      service.name.toLowerCase().includes("vendure-server") ||
      service.sourcePath?.toLowerCase() === VENDURE_BACKEND_PATH.toLowerCase())
  );
}

export function removeVendureEmailEnvironment(projectEnvironment: string) {
  return removeDokployProjectEnvEntries(
    projectEnvironment,
    new Set(VENDURE_EMAIL_ENVIRONMENT_KEYS),
  );
}

export function getVendureEmailEnvironment(projectEnvironment: string) {
  const entries = parseDokployEnvironmentEntries(projectEnvironment);
  return Object.fromEntries(
    VENDURE_EMAIL_ENVIRONMENT_KEYS.flatMap((key) =>
      entries[key] ? [[key, entries[key]]] : [],
    ),
  );
}
