"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { resolve4 } from "node:dns/promises";
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
import { getCloudflareZones } from "@/lib/cloudflare/zones";
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

async function verifyRootDomainIp(rootDomain: string, expectedIp: string) {
  try {
    const addresses = await resolve4(rootDomain);
    if (!addresses.includes(expectedIp)) {
      throw new Error(
        `${rootDomain} resolves to ${addresses.join(", ")}, not ${expectedIp}.`,
      );
    }
    return expectedIp;
  } catch {
    throw new Error(`${rootDomain} does not resolve to ${expectedIp}.`);
  }
}

async function getCloudflareDomainIp(rootDomain: string) {
  const zone = (await getCloudflareZones()).find(
    ({ name }) => name.toLowerCase() === rootDomain.toLowerCase(),
  );
  if (!zone?.ipAddress || !isIP(zone.ipAddress)) {
    throw new Error(
      `${rootDomain} does not have an apex A record in Cloudflare.`,
    );
  }
  return zone.ipAddress;
}

export async function verifyRootDomainIpAction(
  rootDomain: string,
  expectedIp: string,
) {
  if (!(await requireAuthenticatedSession())) {
    return { status: "error" as const, message: SESSION_EXPIRED_STATE.message };
  }

  try {
    const normalizedDomain = normalizeRootDomain(rootDomain);
    const cloudflareIp = await getCloudflareDomainIp(normalizedDomain);
    if (cloudflareIp !== expectedIp) {
      throw new Error("The Cloudflare domain IP changed. Select it again.");
    }
    return {
      status: "success" as const,
      ipAddress: await verifyRootDomainIp(normalizedDomain, cloudflareIp),
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to verify the root domain.",
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
  const configuredUsername =
    process.env.INFRA_SERVICES_DEFAULT_USERNAME?.trim() ?? "";
  const configuredPassword = process.env.INFRA_SERVICES_DEFAULT_PASSWORD ?? "";
  if (
    parsed.apiKey ||
    parsed.defaultServiceUsername !== configuredUsername ||
    parsed.defaultServicePassword !== configuredPassword
  ) {
    return {
      status: "error",
      message: "The default credentials and API/CLI key cannot be changed.",
    };
  }

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
    const cloudflareIp = await getCloudflareDomainIp(parsed.rootDomain);
    if (submittedIpAddress !== cloudflareIp) {
      return {
        status: "error",
        message: "The selected Cloudflare IP is no longer current.",
      };
    }
    const ipAddress = await verifyRootDomainIp(parsed.rootDomain, cloudflareIp);
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
  if (
    parsed.rootDomain !== current.rootDomain ||
    submittedVpsIp !== current.vpsIp
  ) {
    return {
      status: "error",
      message: "The domain and Cloudflare IP cannot be changed after creation.",
    };
  }
  if (
    parsed.apiKey !== current.apiKey ||
    parsed.defaultServiceUsername !== current.defaultServiceUsername ||
    parsed.defaultServicePassword !== current.defaultServicePassword
  ) {
    return {
      status: "error",
      message: "The default credentials and API/CLI key cannot be changed.",
    };
  }

  try {
    await verifyDokployConnection({
      baseUrl: current.rootUrl,
      apiKey: parsed.apiKey,
    });
    const updated = updateDokployInstance(instanceId, {
      ...parsed,
      rootDomain: current.rootDomain,
      rootUrl: current.rootUrl,
      vpsIp: current.vpsIp,
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
