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
  updateCloudflareDnsRecord,
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
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
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

function ipv4Address(value: string) {
  const address = value.trim();
  if (
    !IPV4_PATTERN.test(address) ||
    address.split(".").some((part) => Number(part) > 255)
  ) {
    return null;
  }
  return address;
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

export async function updateSubdomainAction(input: {
  zoneId: string;
  zoneName: string;
  recordId: string;
  label: string;
  ipAddress?: string;
}): Promise<CloudflareActionState> {
  if (!(await isAuthenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  const name = subdomainName(input.label, input.zoneName);
  const ipAddress =
    input.ipAddress === undefined ? undefined : ipv4Address(input.ipAddress);
  if (
    !ID_PATTERN.test(input.zoneId) ||
    !ID_PATTERN.test(input.recordId) ||
    !name ||
    (input.ipAddress !== undefined && !ipAddress)
  ) {
    return {
      status: "error",
      message:
        ipAddress === null
          ? "Enter a valid IPv4 address."
          : "Enter a valid subdomain name.",
    };
  }
  try {
    const zone = (await getCloudflareZones()).find(
      (candidate) =>
        candidate.id === input.zoneId && candidate.name === input.zoneName,
    );
    const record = zone?.subdomains.find(
      (candidate) => candidate.id === input.recordId,
    );
    if (!record || (ipAddress !== undefined && record.type !== "A")) {
      return { status: "error", message: "Invalid DNS record." };
    }
    await updateCloudflareDnsRecord({
      zoneId: input.zoneId,
      recordId: input.recordId,
      name,
      ...(ipAddress ? { content: ipAddress } : {}),
    });
    invalidateCloudflareZones();
    revalidatePath("/cloudflare");
    return { status: "success", message: "DNS record updated." };
  } catch (error) {
    return safeFailure(error);
  }
}

export async function updateAllARecordsAction(input: {
  zoneId: string;
  ipAddress: string;
}): Promise<CloudflareActionState> {
  if (!(await isAuthenticated())) {
    return { status: "error", message: "Your session has expired." };
  }
  const ipAddress = ipv4Address(input.ipAddress);
  if (!ID_PATTERN.test(input.zoneId) || !ipAddress) {
    return { status: "error", message: "Enter a valid IPv4 address." };
  }
  try {
    const zone = (await getCloudflareZones()).find(
      (candidate) => candidate.id === input.zoneId,
    );
    const recordIds = [
      ...(zone?.apexARecordId ? [zone.apexARecordId] : []),
      ...(zone?.subdomains
        .filter((record) => record.type === "A")
        .map((record) => record.id) ?? []),
    ];
    if (recordIds.length === 0) {
      return { status: "error", message: "This domain has no A records." };
    }
    await Promise.all(
      recordIds.map((recordId) =>
        updateCloudflareDnsRecord({
          zoneId: input.zoneId,
          recordId,
          content: ipAddress,
        }),
      ),
    );
    invalidateCloudflareZones();
    revalidatePath("/cloudflare");
    return {
      status: "success",
      message: `${recordIds.length} A ${recordIds.length === 1 ? "record" : "records"} updated.`,
    };
  } catch (error) {
    return safeFailure(error);
  }
}

export const renameSubdomainAction = updateSubdomainAction;

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
