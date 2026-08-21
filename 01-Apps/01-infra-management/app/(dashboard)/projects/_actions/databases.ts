"use server";

import { revalidatePath } from "next/cache";
import { createDokployDatabase, type DokployDatabaseType } from "@/lib/dokploy";
import {
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "./shared";

const DATABASE_TYPES: DokployDatabaseType[] = [
  "postgres",
  "mysql",
  "mariadb",
  "mongo",
  "redis",
];

export async function createDatabaseAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const type = formData.get("type") as DokployDatabaseType;
  const environmentId = formData.get("environmentId")?.toString() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const databaseName = formData.get("databaseName")?.toString().trim() ?? "";
  const databaseUser = formData.get("databaseUser")?.toString().trim() ?? "";
  const databasePassword = formData.get("databasePassword")?.toString() ?? "";
  const needsDatabaseName = ["postgres", "mysql", "mariadb"].includes(type);
  const needsUser = type !== "redis";

  if (
    !projectId ||
    !environmentId ||
    !DATABASE_TYPES.includes(type) ||
    !name ||
    !databasePassword ||
    (needsDatabaseName && !databaseName) ||
    (needsUser && !databaseUser)
  ) {
    return { status: "error", message: "Complete all required fields." };
  }
  if (
    [name, databaseName, databaseUser, databasePassword].some(
      (value) => value.length > 255,
    )
  ) {
    return { status: "error", message: "Database details are too long." };
  }

  try {
    await createDokployDatabase({
      type,
      environmentId,
      name,
      databaseName: needsDatabaseName ? databaseName : undefined,
      databaseUser: needsUser ? databaseUser : undefined,
      databasePassword,
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Database created." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to create the database.",
      "the database",
    );
  }
}
