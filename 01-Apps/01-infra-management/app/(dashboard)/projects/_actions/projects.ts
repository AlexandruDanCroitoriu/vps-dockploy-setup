"use server";

import { revalidatePath } from "next/cache";
import {
  createDokployProject,
  updateDokployProjectEnv,
  updateDokployProjectName,
} from "@/lib/dokploy";
import {
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "./shared";

export async function createProjectAction(
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  const name = formData.get("name")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  if (!name) return { status: "error", message: "Project name is required." };
  if (name.length > 255 || description.length > 1_000) {
    return { status: "error", message: "Project details are too long." };
  }

  try {
    await createDokployProject(name, description);
    revalidatePath("/projects");
    return { status: "success", message: "Project created." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to create the project.",
      "the project",
    );
  }
}

export async function updateProjectNameAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const name = formData.get("name")?.toString().trim() ?? "";
  if (!projectId || !name)
    return { status: "error", message: "Project name is required." };
  if (name.length > 255)
    return { status: "error", message: "Project name is too long." };

  try {
    await updateDokployProjectName(projectId, name);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Project renamed." };
  } catch (error) {
    return getActionError(error, "Unable to rename the project.", "the rename");
  }
}

export async function updateProjectEnvAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const env = formData.get("env");
  if (!projectId || typeof env !== "string")
    return { status: "error", message: "Invalid environment variables." };
  if (env.length > 1_000_000)
    return { status: "error", message: "Environment file is too large." };

  try {
    await updateDokployProjectEnv(projectId, env);
    return { status: "success", message: "Environment variables saved." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to save environment variables.",
      "the update",
    );
  }
}
