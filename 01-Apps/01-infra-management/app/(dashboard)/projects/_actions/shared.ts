import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  deployDokployService,
  DokployApiError,
  type DokployServiceType,
} from "@/lib/dokploy";

export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  createdService?: {
    id: string;
    type: DokployServiceType;
  };
};

export async function requireAuthenticatedSession() {
  const session = await getServerSession(authOptions);
  return Boolean(session?.user);
}

export const SESSION_EXPIRED_STATE: ActionState = {
  status: "error",
  message: "Your session has expired.",
};

export function getActionError(
  error: unknown,
  fallback: string,
  rejectedSubject?: string,
): ActionState {
  if (error instanceof DokployApiError && rejectedSubject) {
    return {
      status: "error",
      message: `Dokploy rejected ${rejectedSubject} at ${error.endpoint} (HTTP ${error.status}).`,
    };
  }
  return { status: "error", message: fallback };
}

export function deployAfterCreateRequested(formData: FormData) {
  return formData.get("deployAfterCreate") === "on";
}

export async function startInitialDeployment(
  type: DokployServiceType,
  serviceId: string,
) {
  try {
    await deployDokployService(type, serviceId);
    return true;
  } catch {
    return false;
  }
}
