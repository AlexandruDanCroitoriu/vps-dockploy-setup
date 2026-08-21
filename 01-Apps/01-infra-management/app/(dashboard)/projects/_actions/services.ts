"use server";

import { revalidatePath } from "next/cache";
import {
  DOKPLOY_SERVICE_TYPES,
  deployDokployService,
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
