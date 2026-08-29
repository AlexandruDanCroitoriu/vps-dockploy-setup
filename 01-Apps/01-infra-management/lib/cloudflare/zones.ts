import "server-only";

import {
  getCloudflareZonesSnapshot,
  invalidateCloudflareZonesSnapshot,
} from "./memory-state";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";
const ZONES_PER_PAGE = 50;
const DNS_RECORDS_PER_PAGE = 5_000;

export type CloudflareZone = {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  ipAddress: string;
  subdomains: CloudflareDnsRecord[];
};

export type CloudflareDnsRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
};

export type CloudflareDnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX";

type CloudflareZonesResponse = {
  success?: unknown;
  result?: unknown;
  result_info?: {
    page?: unknown;
    total_pages?: unknown;
  };
};

export class CloudflareConfigurationError extends Error {
  constructor() {
    super("Cloudflare API token is not configured.");
    this.name = "CloudflareConfigurationError";
  }
}

function normalizeZone(value: unknown): CloudflareZone | null {
  if (!value || typeof value !== "object") return null;

  const zone = value as Record<string, unknown>;
  if (typeof zone.id !== "string" || typeof zone.name !== "string") {
    return null;
  }

  return {
    id: zone.id,
    name: zone.name,
    status: typeof zone.status === "string" ? zone.status : "unknown",
    paused: zone.paused === true,
    ipAddress: "",
    subdomains: [],
  };
}

async function getZoneSubdomains(
  zone: CloudflareZone,
  token: string,
): Promise<{ ipAddress: string; subdomains: CloudflareDnsRecord[] }> {
  const records = new Map<string, CloudflareDnsRecord>();
  let apexIpAddress = "";
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(DNS_RECORDS_PER_PAGE),
    });
    const response = await fetch(
      `${CLOUDFLARE_API_URL}/zones/${encodeURIComponent(zone.id)}/dns_records?${query}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    const payload = (await response
      .json()
      .catch(() => null)) as CloudflareZonesResponse | null;

    if (
      !response.ok ||
      payload?.success !== true ||
      !Array.isArray(payload.result)
    ) {
      throw new Error("Unable to load DNS records from Cloudflare.");
    }

    for (const record of payload.result) {
      if (!record || typeof record !== "object") continue;
      const value = record as Record<string, unknown>;
      const recordName =
        typeof value.name === "string"
          ? value.name.toLowerCase().replace(/\.$/, "")
          : "";
      const zoneName = zone.name.toLowerCase().replace(/\.$/, "");
      if (
        !apexIpAddress &&
        recordName === zoneName &&
        value.type === "A" &&
        typeof value.content === "string"
      ) {
        apexIpAddress = value.content;
      }
      if (
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        recordName !== zoneName
      ) {
        records.set(value.id, {
          id: value.id,
          name: value.name,
          type: typeof value.type === "string" ? value.type : "unknown",
          content: typeof value.content === "string" ? value.content : "",
          proxied: value.proxied === true,
        });
      }
    }

    const reportedTotalPages = payload.result_info?.total_pages;
    totalPages =
      typeof reportedTotalPages === "number" &&
      Number.isSafeInteger(reportedTotalPages) &&
      reportedTotalPages >= page
        ? reportedTotalPages
        : page;
    page += 1;
  } while (page <= totalPages);

  return {
    ipAddress: apexIpAddress,
    subdomains: [...records.values()].sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.type.localeCompare(right.type),
    ),
  };
}

function getCloudflareApiToken() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) throw new CloudflareConfigurationError();
  return token;
}

async function mutateDnsRecord(
  zoneId: string,
  recordId: string | null,
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
) {
  const token = getCloudflareApiToken();
  const recordPath = recordId
    ? `/dns_records/${encodeURIComponent(recordId)}`
    : "/dns_records";
  const response = await fetch(
    `${CLOUDFLARE_API_URL}/zones/${encodeURIComponent(zoneId)}${recordPath}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    success?: unknown;
  } | null;
  if (!response.ok || payload?.success !== true) {
    throw new Error("Cloudflare rejected the DNS record change.");
  }
}

export async function createCloudflareDnsRecord(input: {
  zoneId: string;
  name: string;
  type: CloudflareDnsRecordType;
  content: string;
  proxied: boolean;
  priority?: number;
}) {
  await mutateDnsRecord(input.zoneId, null, "POST", {
    name: input.name,
    type: input.type,
    content: input.content,
    ttl: 1,
    ...(input.type === "MX" ? { priority: input.priority ?? 10 } : {}),
    proxied:
      input.type === "A" || input.type === "AAAA" || input.type === "CNAME"
        ? input.proxied
        : false,
  });
}

export async function renameCloudflareDnsRecord(input: {
  zoneId: string;
  recordId: string;
  name: string;
}) {
  await mutateDnsRecord(input.zoneId, input.recordId, "PATCH", {
    name: input.name,
  });
}

export async function deleteCloudflareDnsRecord(input: {
  zoneId: string;
  recordId: string;
}) {
  await mutateDnsRecord(input.zoneId, input.recordId, "DELETE");
}

async function loadCloudflareZones(): Promise<CloudflareZone[]> {
  const token = getCloudflareApiToken();

  const zones: CloudflareZone[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(ZONES_PER_PAGE),
    });
    const response = await fetch(`${CLOUDFLARE_API_URL}/zones?${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const payload = (await response
      .json()
      .catch(() => null)) as CloudflareZonesResponse | null;

    if (
      !response.ok ||
      payload?.success !== true ||
      !Array.isArray(payload.result)
    ) {
      throw new Error("Unable to load domains from Cloudflare.");
    }

    zones.push(
      ...payload.result.flatMap((zone) => {
        const normalized = normalizeZone(zone);
        return normalized ? [normalized] : [];
      }),
    );

    const reportedTotalPages = payload.result_info?.total_pages;
    totalPages =
      typeof reportedTotalPages === "number" &&
      Number.isSafeInteger(reportedTotalPages) &&
      reportedTotalPages >= page
        ? reportedTotalPages
        : page;
    page += 1;
  } while (page <= totalPages);

  const sortedZones = zones.sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  return Promise.all(
    sortedZones.map(async (zone) => ({
      ...zone,
      ...(await getZoneSubdomains(zone, token)),
    })),
  );
}

export function getCloudflareZones(): Promise<CloudflareZone[]> {
  return getCloudflareZonesSnapshot(loadCloudflareZones);
}

export function invalidateCloudflareZones() {
  invalidateCloudflareZonesSnapshot();
}

export async function refreshCloudflareZones() {
  invalidateCloudflareZonesSnapshot();
  return getCloudflareZones();
}
