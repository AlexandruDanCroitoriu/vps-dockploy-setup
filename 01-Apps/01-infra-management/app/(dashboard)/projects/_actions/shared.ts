import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { DokployApiError } from "@/lib/dokploy";

export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
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
      message: `Dokploy rejected ${rejectedSubject} (HTTP ${error.status}).`,
    };
  }
  return { status: "error", message: fallback };
}
