import "server-only";
import { dokployPost } from "./client";
import { databaseCredentials, isRecord, stringValue } from "./normalizers";
import {
  mergeDokployProjectEnv,
  removeDokployProjectEnvEntries,
} from "./projects";
import type { DokployDatabaseType, DokployService } from "./types";

export async function createDokployDatabase(input: {
  type: DokployDatabaseType;
  environmentId: string;
  name: string;
  databaseName?: string;
  databaseUser?: string;
  databasePassword: string;
}) {
  const payload = await dokployPost<unknown>(`${input.type}.create`, {
    name: input.name,
    environmentId: input.environmentId,
    databasePassword: input.databasePassword,
    ...(input.databaseName ? { databaseName: input.databaseName } : {}),
    ...(input.databaseUser ? { databaseUser: input.databaseUser } : {}),
  });
  const candidate =
    isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  const values = isRecord(candidate)
    ? candidate
    : {
        appName: "",
      };
  return {
    databaseId: stringValue(values[`${input.type}Id`]),
    credentials: databaseCredentials(
      {
        ...values,
        databaseUser: input.databaseUser ?? values.databaseUser,
        databasePassword: input.databasePassword,
        databaseName: input.databaseName ?? values.databaseName,
      },
      input.type,
    ),
  };
}

export function databaseProjectEnvironmentEntries(
  type: DokployDatabaseType,
  name: string,
  credentials: ReadonlyArray<{ label: string; value: string }>,
) {
  const namePrefix =
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || type.toUpperCase();
  const safeNamePrefix = /^\d/.test(namePrefix)
    ? `DB_${namePrefix}`
    : namePrefix;
  const prefixes = [...new Set([type.toUpperCase(), safeNamePrefix])];
  const values = new Map(credentials.map(({ label, value }) => [label, value]));
  const fields = [
    ["HOST", values.get("Internal Host")],
    ["PORT", values.get("Internal Port")],
    ["USER", values.get("User")],
    ["PASSWORD", values.get("Password")],
    ["DATABASE", values.get("Database Name")],
    ["URL", values.get("Internal Connection URL")],
  ] as const;
  return Object.fromEntries(
    prefixes.flatMap((prefix) =>
      fields.flatMap(([suffix, value]) =>
        value ? [[`${prefix}_${suffix}`, value]] : [],
      ),
    ),
  );
}

export function mergeDatabaseCredentialsIntoProjectEnv(
  current: string,
  services: readonly DokployService[],
) {
  return services.reduce((environment, service) => {
    if (service.type === "applications" || service.type === "compose") {
      return environment;
    }
    return mergeDokployProjectEnv(
      environment,
      databaseProjectEnvironmentEntries(
        service.type,
        service.name,
        service.credentials,
      ),
    );
  }, current);
}

export function removeDatabaseCredentialsFromProjectEnv(
  current: string,
  removedService: DokployService,
  remainingServices: readonly DokployService[],
) {
  const removedKeys = new Set(
    Object.keys(
      databaseProjectEnvironmentEntries(
        removedService.type as DokployDatabaseType,
        removedService.name,
        removedService.credentials,
      ),
    ),
  );
  return mergeDatabaseCredentialsIntoProjectEnv(
    removeDokployProjectEnvEntries(current, removedKeys),
    remainingServices,
  );
}
