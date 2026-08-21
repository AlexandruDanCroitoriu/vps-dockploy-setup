"use server";

import { revalidatePath } from "next/cache";
import {
  DOKPLOY_SERVICE_TYPES,
  deployDokployService,
  reloadDokployService,
  stopDokployService,
  updateDokployServiceEnv,
  type DokployServiceType,
} from "@/lib/dokploy";
import {
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "./shared";

export async function updateServiceEnvAction(
  type: DokployServiceType,
  serviceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const env = formData.get("env");
  if (
    !DOKPLOY_SERVICE_TYPES.includes(type) ||
    !serviceId ||
    typeof env !== "string"
  )
    return { status: "error", message: "Invalid environment variables." };
  if (env.length > 1_000_000)
    return { status: "error", message: "Environment file is too large." };
  try {
    await updateDokployServiceEnv(type, serviceId, env);
    return { status: "success", message: "Service variables saved." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to save service variables.",
      "the update",
    );
  }
}

export async function reloadServiceAction(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
  appName: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (
    !projectId ||
    !DOKPLOY_SERVICE_TYPES.includes(type) ||
    !serviceId ||
    !/^[a-zA-Z0-9._-]{1,63}$/.test(appName)
  )
    return { status: "error", message: "Invalid service." };
  try {
    await reloadDokployService(type, serviceId, appName);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Service reloaded." };
  } catch (error) {
    return getActionError(error, "Unable to reload the service.", "the reload");
  }
}

export async function stopServiceAction(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (!projectId || !DOKPLOY_SERVICE_TYPES.includes(type) || !serviceId)
    return { status: "error", message: "Invalid service." };
  try {
    await stopDokployService(type, serviceId);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Service stopped." };
  } catch (error) {
    return getActionError(error, "Unable to stop the service.", "the stop");
  }
}

export async function deployServiceAction(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (!projectId || !DOKPLOY_SERVICE_TYPES.includes(type) || !serviceId)
    return { status: "error", message: "Invalid service." };
  try {
    await deployDokployService(type, serviceId);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Deployment started." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to start the deployment.",
      "the deployment",
    );
  }
}
