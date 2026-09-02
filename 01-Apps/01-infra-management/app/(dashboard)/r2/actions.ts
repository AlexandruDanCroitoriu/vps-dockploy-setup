"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import {
  createCloudflareR2Bucket,
  deleteCloudflareR2Bucket,
} from "@/lib/cloudflare/r2";
import { syncR2BucketToAllDokployInstances } from "@/lib/dokploy/r2-destinations";
import { removeR2BucketFromAllDokployInstances } from "@/lib/dokploy/r2-destinations";

export type R2ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

async function authenticated() {
  return Boolean((await getServerSession(authOptions))?.user);
}

function failure(error: unknown): R2ActionState {
  return {
    status: "error",
    message:
      error instanceof Error ? error.message : "The R2 operation failed.",
  };
}

export async function createR2BucketAction(
  previousState: R2ActionState,
  formData: FormData,
): Promise<R2ActionState> {
  void previousState;
  if (!(await authenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  try {
    const name = String(formData.get("name") ?? "")
      .trim()
      .toLowerCase();
    await createCloudflareR2Bucket(name);
    const results = await syncR2BucketToAllDokployInstances(name);
    revalidatePath("/r2");
    const failed = results.filter((result) => !result.synced);
    const details = failed
      .map((result) => `${result.name}: ${result.error}`)
      .join("; ");
    return {
      status: failed.length ? "error" : "success",
      message: failed.length
        ? `Bucket ${name} was created, but synchronization failed — ${details}`
        : `Bucket ${name} created and synchronized to ${results.length} Dokploy instance${results.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function syncR2BucketAction(
  previousState: R2ActionState,
  formData: FormData,
): Promise<R2ActionState> {
  void previousState;
  if (!(await authenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  try {
    const name = String(formData.get("name") ?? "").trim();
    const results = await syncR2BucketToAllDokployInstances(name);
    const failed = results.filter((result) => !result.synced);
    const details = failed
      .map((result) => `${result.name}: ${result.error}`)
      .join("; ");
    revalidatePath("/r2");
    return failed.length
      ? {
          status: "error",
          message: `Synchronization failed — ${details}`,
        }
      : {
          status: "success",
          message: `${name} synchronized to all Dokploy instances.`,
        };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteR2BucketAction(
  previousState: R2ActionState,
  formData: FormData,
): Promise<R2ActionState> {
  void previousState;
  if (!(await authenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  try {
    const name = String(formData.get("name") ?? "").trim();
    await deleteCloudflareR2Bucket(name);
    await removeR2BucketFromAllDokployInstances(name);
    revalidatePath("/r2");
    return { status: "success", message: `Bucket ${name} deleted.` };
  } catch (error) {
    return failure(error);
  }
}
