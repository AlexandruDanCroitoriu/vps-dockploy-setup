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
  configurePostgresR2Backup,
  restorePostgresBackup,
  runPostgresBackupManually,
} from "@/lib/dokploy/vendure-backups";
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
  const backupBucket = formData.get("backupBucket")?.toString().trim() ?? "";
  const backupPrefix = formData.get("backupPrefix")?.toString().trim() ?? "";
  const backupTime = formData.get("backupTime")?.toString().trim() ?? "";
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
    if (type === "postgres" && backupBucket) {
      try {
        await configurePostgresR2Backup({
          postgresId: databaseId,
          bucket: backupBucket,
          prefix: backupPrefix,
          time: backupTime,
        });
      } catch (error) {
        revalidatePath("/dokploy");
        revalidatePath(`/dokploy/${projectId}`);
        return {
          status: "error",
          message: `PostgreSQL was created, but its R2 backup could not be configured: ${error instanceof Error ? error.message : "Unknown error"}`,
          createdService: { id: databaseId, type },
        };
      }
    }
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

export async function restorePostgresBackupAction(
  projectId: string,
  postgresId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  try {
    const backupKey = String(formData.get("backupKey") ?? "");
    if (!backupKey)
      return { status: "error", message: "Select a recovery point." };
    const result = await restorePostgresBackup({ postgresId, backupKey });
    revalidatePath(`/dokploy/${projectId}`);
    revalidatePath(
      `/dokploy/${encodeURIComponent(projectId)}/services/postgres/${encodeURIComponent(postgresId)}`,
    );
    return {
      status: "success",
      message: result.returnedToPresent
        ? "PostgreSQL was returned to the safety backup."
        : "PostgreSQL was restored. A safety backup is available as Return to present.",
    };
  } catch (error) {
    return getActionError(
      error,
      error instanceof Error ? error.message : "Unable to restore PostgreSQL.",
      "the PostgreSQL recovery point",
    );
  }
}

export async function updatePostgresBackupAction(
  projectId: string,
  postgresId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  try {
    await configurePostgresR2Backup({
      postgresId,
      bucket: String(formData.get("bucket") ?? "").trim(),
      prefix: String(formData.get("prefix") ?? "").trim(),
      time: String(formData.get("time") ?? "").trim(),
    });
    revalidatePath(`/dokploy/${projectId}`);
    revalidatePath(
      `/dokploy/${encodeURIComponent(projectId)}/services/postgres/${encodeURIComponent(postgresId)}`,
    );
    revalidatePath("/instance");
    return {
      status: "success",
      message: "PostgreSQL backup configuration saved.",
    };
  } catch (error) {
    return getActionError(
      error,
      error instanceof Error ? error.message : "Unable to update the backup.",
      "the PostgreSQL backup configuration",
    );
  }
}

export async function runPostgresBackupAction(
  projectId: string,
  postgresId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  try {
    await runPostgresBackupManually(postgresId);
    revalidatePath(`/dokploy/${projectId}`);
    revalidatePath(
      `/dokploy/${encodeURIComponent(projectId)}/services/postgres/${encodeURIComponent(postgresId)}`,
    );
    revalidatePath("/instance");
    return { status: "success", message: "PostgreSQL backup started." };
  } catch (error) {
    return getActionError(
      error,
      error instanceof Error ? error.message : "Unable to start the backup.",
      "the PostgreSQL backup",
    );
  }
}
