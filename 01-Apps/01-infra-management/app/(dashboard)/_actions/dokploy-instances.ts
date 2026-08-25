"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ACTIVE_DOKPLOY_COOKIE, verifyDokployConnection } from "@/lib/dokploy";
import {
  createDokployInstance,
  deleteDokployInstance,
  getDokployUrlFromRootDomain,
  getDokployInstance,
  isDuplicateInstanceError,
  normalizeRootDomain,
  updateDokployInstance,
} from "@/lib/storage/dokploy-instances";
import {
  getDokployProvisioningJob,
  startDokployProvisioningJob,
} from "@/lib/storage/dokploy-provisioning";
import {
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "../dokploy/_actions/shared";

type ParsedInstanceForm = {
  name: string;
  rootDomain: string;
  rootUrl: string;
  apiKey: string;
  defaultServiceUsername: string;
  defaultServicePassword: string;
};

async function resolveVpsIp(rootDomain: string) {
  try {
    return (await lookup(`dockploy.${rootDomain}`)).address;
  } catch {
    throw new Error(
      `Unable to resolve dockploy.${rootDomain} to a VPS IP address.`,
    );
  }
}

export async function resolveDokployVpsIpAction(rootDomain: string) {
  if (!(await requireAuthenticatedSession())) {
    return { status: "error" as const, message: SESSION_EXPIRED_STATE.message };
  }

  try {
    const normalizedDomain = normalizeRootDomain(rootDomain);
    return {
      status: "success" as const,
      ipAddress: await resolveVpsIp(normalizedDomain),
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to resolve the Dockploy domain.",
    };
  }
}

function parseInstanceForm(
  formData: FormData,
  existingApiKey = "",
  allowMissingApiKey = false,
): ParsedInstanceForm | ActionState {
  const name = formData.get("name")?.toString().trim() ?? "";
  const submittedApiKey = formData.get("apiKey")?.toString().trim() ?? "";
  const apiKey = submittedApiKey || existingApiKey;
  const defaultServiceUsername =
    formData.get("defaultServiceUsername")?.toString().trim() ?? "";
  const defaultServicePassword =
    formData.get("defaultServicePassword")?.toString() ?? "";
  const rawRootDomain = formData.get("rootDomain")?.toString().trim() ?? "";

  if (!name || name.length > 100) {
    return { status: "error", message: "Enter a name up to 100 characters." };
  }
  if ((!apiKey && !allowMissingApiKey) || submittedApiKey.length > 4096) {
    return { status: "error", message: "Enter a valid API/CLI key." };
  }
  if (
    !defaultServiceUsername ||
    !defaultServicePassword ||
    defaultServiceUsername.length > 255 ||
    defaultServicePassword.length > 255
  ) {
    return {
      status: "error",
      message: "Enter default service credentials up to 255 characters.",
    };
  }

  try {
    const rootDomain = normalizeRootDomain(rawRootDomain);
    return {
      name,
      rootDomain,
      rootUrl: getDokployUrlFromRootDomain(rootDomain),
      apiKey,
      defaultServiceUsername,
      defaultServicePassword,
    };
  } catch {
    return {
      status: "error",
      message: "Enter a valid root domain, such as example.com.",
    };
  }
}

export async function createDokployInstanceAction(
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  const submittedIpAddress = formData.get("ipAddress")?.toString().trim() ?? "";
  const parsed = parseInstanceForm(formData, "", true);
  if ("status" in parsed) return parsed;

  if (submittedIpAddress && !isIP(submittedIpAddress)) {
    return { status: "error", message: "Enter a valid VPS IP address." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.defaultServiceUsername)) {
    return {
      status: "error",
      message:
        "For VPS setup, the default service username must be a valid email address for the Dokploy administrator.",
    };
  }

  try {
    const ipAddress =
      submittedIpAddress || (await resolveVpsIp(parsed.rootDomain));
    const instance = createDokployInstance({
      ...parsed,
      apiKey: "",
      vpsIp: ipAddress,
      vpsPassword: parsed.defaultServicePassword,
    });
    startDokployProvisioningJob({
      instanceId: instance.id,
      name: parsed.name,
      rootUrl: parsed.rootUrl,
      rootDomain: parsed.rootDomain,
      vpsIp: ipAddress,
      defaultServiceUsername: parsed.defaultServiceUsername,
      defaultServicePassword: parsed.defaultServicePassword,
    });
    (await cookies()).set(ACTIVE_DOKPLOY_COOKIE, instance.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    revalidatePath("/", "layout");
    return { status: "success", message: "New instance saved." };
  } catch (error) {
    if (isDuplicateInstanceError(error)) {
      return {
        status: "error",
        message: "That Dockploy URL is already configured.",
      };
    }
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to save the new instance.",
    };
  }
}

export async function selectDokployInstanceAction(instanceId: string) {
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const instance = getDokployInstance(instanceId);
  const provisioningJob = getDokployProvisioningJob(instanceId);
  if (!instance && !provisioningJob) {
    return {
      status: "error",
      message: "Dockploy instance not found.",
    } as ActionState;
  }
  (await cookies()).set(
    ACTIVE_DOKPLOY_COOKIE,
    instance?.id ?? provisioningJob!.id,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  );
  revalidatePath("/", "layout");
  return {
    status: "success",
    message: "Dockploy instance selected.",
  } as ActionState;
}

export async function clearActiveDokployInstanceAction() {
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  (await cookies()).delete(ACTIVE_DOKPLOY_COOKIE);
  revalidatePath("/", "layout");
  return {
    status: "success",
    message: "Dockploy instance deselected.",
  } as ActionState;
}

export async function deleteDokployInstanceAction(
  instanceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (!instanceId || !getDokployInstance(instanceId)) {
    return { status: "error", message: "Dockploy instance not found." };
  }

  try {
    if (!deleteDokployInstance(instanceId)) {
      return {
        status: "error",
        message: "Unable to delete the Dockploy instance.",
      };
    }
    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_DOKPLOY_COOKIE)?.value === instanceId) {
      cookieStore.delete(ACTIVE_DOKPLOY_COOKIE);
    }
    revalidatePath("/", "layout");
    return { status: "success", message: "Dockploy instance deleted." };
  } catch {
    return {
      status: "error",
      message: "Unable to delete the Dockploy instance.",
    };
  }
}

export async function updateDokployInstanceAction(
  instanceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  const current = getDokployInstance(instanceId);
  if (!current) {
    return { status: "error", message: "Dockploy instance not found." };
  }
  const parsed = parseInstanceForm(formData, current.apiKey);
  if ("status" in parsed) return parsed;
  const submittedVpsIp = formData.get("ipAddress")?.toString().trim() ?? "";
  if (submittedVpsIp && !isIP(submittedVpsIp)) {
    return { status: "error", message: "Enter a valid VPS IP address." };
  }

  try {
    const vpsIp = submittedVpsIp || (await resolveVpsIp(parsed.rootDomain));
    await verifyDokployConnection({
      baseUrl: parsed.rootUrl,
      apiKey: parsed.apiKey,
    });
    const updated = updateDokployInstance(instanceId, {
      ...parsed,
      vpsIp,
      vpsPassword: parsed.defaultServicePassword,
    });
    if (!updated) {
      return { status: "error", message: "Dockploy instance not found." };
    }
    revalidatePath("/", "layout");
    return { status: "success", message: "Dockploy instance updated." };
  } catch (error) {
    if (isDuplicateInstanceError(error)) {
      return {
        status: "error",
        message: "That Dockploy URL is already configured.",
      };
    }
    return {
      status: "error",
      message: "Unable to connect to Dockploy with that URL and API/CLI key.",
    };
  }
}
