"use server";

import { revalidatePath } from "next/cache";
import { getActiveDokployInstanceSummary } from "@/lib/dokploy";
import { invalidateDokployMemoryState } from "@/lib/dokploy/instance-memory-state";
import { clearDokployRenderSnapshots } from "@/lib/dokploy/render-snapshot-cache";
import { clearSidebarProjectSnapshot } from "@/lib/dokploy/sidebar-project-snapshot";
import { requireAuthenticatedSession, SESSION_EXPIRED_STATE } from "./shared";

export async function refreshDokployDataAction() {
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const instance = await getActiveDokployInstanceSummary();
  if (!instance) {
    return { status: "error" as const, message: "Select a Dokploy instance." };
  }

  invalidateDokployMemoryState(instance.id);
  clearDokployRenderSnapshots(instance.id);
  clearSidebarProjectSnapshot(instance.id);
  revalidatePath("/dokploy", "layout");
  return { status: "success" as const, message: "Dokploy data refreshed." };
}
