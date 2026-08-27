"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  createCloudflareDnsRecord,
  deleteCloudflareDnsRecord,
  getCloudflareZones,
  invalidateCloudflareZones,
  refreshCloudflareZones,
  renameCloudflareDnsRecord,
} from "@/lib/cloudflare/zones";

export type CloudflareActionState = {
  status: "success" | "error";
  message: string;
};

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const DNS_LABEL = "(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)";
const SUBDOMAIN_PATTERN = new RegExp(
  `^(?:\\*|(?:\\*\\.)?${DNS_LABEL}(?:\\.${DNS_LABEL})*)$`,
);
async function isAuthenticated() {
  return Boolean((await getServerSession(authOptions))?.user);
}

function subdomainName(label: string, zoneName: string) {
  const normalizedLabel = label.trim().toLowerCase();
  const normalizedZone = zoneName.trim().toLowerCase();
  if (
    normalizedLabel.length > 253 ||
    !SUBDOMAIN_PATTERN.test(normalizedLabel) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      normalizedZone,
    )
  ) {
    return null;
  }
  return `${normalizedLabel}.${normalizedZone}`;
}

function safeFailure(error: unknown): CloudflareActionState {
  console.error(
    "Cloudflare DNS operation failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return {
    status: "error",
    message: "Cloudflare rejected the DNS record change.",
  };
}

export async function createSubdomainAction(input: {
  zoneId: string;
  zoneName: string;
  label: string;
}): Promise<CloudflareActionState> {
  if (!(await isAuthenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  const name = subdomainName(input.label, input.zoneName);
  if (!ID_PATTERN.test(input.zoneId) || !name) {
    return { status: "error", message: "Enter a valid subdomain name." };
  }
  try {
    const zone = (await getCloudflareZones()).find(
      (candidate) =>
        candidate.id === input.zoneId && candidate.name === input.zoneName,
    );
    if (!zone?.ipAddress) {
      return {
        status: "error",
        message: "This domain does not have an A record IP to copy.",
      };
    }
    await createCloudflareDnsRecord({
      zoneId: input.zoneId,
      name,
      type: "A",
      content: zone.ipAddress,
      proxied: false,
    });
    invalidateCloudflareZones();
    revalidatePath("/cloudflare");
    return { status: "success", message: "Subdomain created." };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function renameSubdomainAction(input: {
  zoneId: string;
  zoneName: string;
  recordId: string;
  label: string;
}): Promise<CloudflareActionState> {
  if (!(await isAuthenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  const name = subdomainName(input.label, input.zoneName);
  if (
    !ID_PATTERN.test(input.zoneId) ||
    !ID_PATTERN.test(input.recordId) ||
    !name
  ) {
    return { status: "error", message: "Enter a valid subdomain name." };
  }
  try {
    await renameCloudflareDnsRecord({
      zoneId: input.zoneId,
      recordId: input.recordId,
      name,
    });
    invalidateCloudflareZones();
    revalidatePath("/cloudflare");
    return { status: "success", message: "Subdomain renamed." };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function deleteSubdomainAction(input: {
  zoneId: string;
  recordId: string;
}): Promise<CloudflareActionState> {
  if (!(await isAuthenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  if (!ID_PATTERN.test(input.zoneId) || !ID_PATTERN.test(input.recordId)) {
    return { status: "error", message: "Invalid DNS record." };
  }
  try {
    await deleteCloudflareDnsRecord(input);
    invalidateCloudflareZones();
    revalidatePath("/cloudflare");
    return { status: "success", message: "Subdomain deleted." };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function refreshCloudflareAction(): Promise<CloudflareActionState> {
  if (!(await isAuthenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  try {
    await refreshCloudflareZones();
    revalidatePath("/cloudflare");
    return { status: "success", message: "Cloudflare domains refreshed." };
  } catch (error) {
    return safeFailure(error);
  }
}
