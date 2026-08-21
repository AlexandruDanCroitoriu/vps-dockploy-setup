import "server-only";
import { dokployPost } from "./client";
import type { DokployDatabaseType } from "./types";

export async function createDokployDatabase(input: {
  type: DokployDatabaseType;
  environmentId: string;
  name: string;
  databaseName?: string;
  databaseUser?: string;
  databasePassword: string;
}) {
  await dokployPost(`${input.type}.create`, {
    name: input.name,
    environmentId: input.environmentId,
    databasePassword: input.databasePassword,
    ...(input.databaseName ? { databaseName: input.databaseName } : {}),
    ...(input.databaseUser ? { databaseUser: input.databaseUser } : {}),
  });
}
