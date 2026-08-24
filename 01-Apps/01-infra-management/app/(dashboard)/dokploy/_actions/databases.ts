"use server";

import { revalidatePath } from "next/cache";
import {
  createDokployDatabase,
  databaseProjectEnvironmentEntries,
  getDokployProject,
  mergeDokployProjectEnv,
  updateDokployProjectEnv,
  type DokployDatabaseType,
} from "@/lib/dokploy";
import {
  deployAfterCreateRequested,
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  startInitialDeployment,
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
  const deployAfterCreate = deployAfterCreateRequested(formData);
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

  let databaseCreated = false;
  try {
    const project = await getDokployProject(projectId);
    if (
      !project?.environments.some(
        (environment) => environment.environmentId === environmentId,
      )
    ) {
      return { status: "error", message: "Invalid project environment." };
    }
    const { databaseId, credentials } = await createDokployDatabase({
      type,
      environmentId,
      name,
      databaseName: needsDatabaseName ? databaseName : undefined,
      databaseUser: needsUser ? databaseUser : undefined,
      databasePassword,
    });
    databaseCreated = true;
    const entries = databaseProjectEnvironmentEntries(type, name, credentials);
    if (
      !credentials.some(
        ({ label, value }) => label === "Internal Host" && value,
      )
    ) {
      return {
        status: "error",
        message:
          "Database created, but Dokploy did not return its internal host.",
      };
    }
    await updateDokployProjectEnv(
      projectId,
      mergeDokployProjectEnv(project.env, entries),
    );
    if (deployAfterCreate) {
      if (!databaseId) {
        revalidatePath("/dokploy");
        revalidatePath(`/dokploy/${projectId}`);
        return {
          status: "error",
          message:
            "Database created and credentials saved, but Dokploy did not return its service ID for deployment.",
        };
      }
      if (!(await startInitialDeployment(type, databaseId))) {
        revalidatePath("/dokploy");
        revalidatePath(`/dokploy/${projectId}`);
        return {
          status: "error",
          message:
            "Database created and credentials saved, but its first deployment could not be started.",
          createdService: { id: databaseId, type },
        };
      }
    }
    revalidatePath("/dokploy");
    revalidatePath(`/dokploy/${projectId}`);
    return {
      status: "success",
      message: deployAfterCreate
        ? "Database created, credentials updated, and deployment started."
        : "Database created and project credentials updated.",
      createdService: { id: databaseId, type },
    };
  } catch (error) {
    if (databaseCreated) {
      return {
        status: "error",
        message:
          "Database created, but its credentials could not be saved to the project variables.",
      };
    }
    return getActionError(
      error,
      "Unable to create the database.",
      "the database",
    );
  }
}
