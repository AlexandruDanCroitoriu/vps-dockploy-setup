"use server";

import { revalidatePath } from "next/cache";

import { runVendureBackupsManually } from "@/lib/dokploy/vendure-backups";

import {
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "../dokploy/_actions/shared";

export async function runVendureBackupsAction(
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  try {
    const count = await runVendureBackupsManually();
    revalidatePath("/instance");
    return {
      status: "success",
      message: `Manual backup started for ${count} Vendure project${count === 1 ? "" : "s"}: PostgreSQL to R2, then Garage volumes to R2.`,
    };
  } catch (error) {
    return getActionError(
      error,
      "Unable to run the managed Vendure backups.",
      "Vendure backups",
    );
  }
}
