import "server-only";

const RESEND_API_URL = "https://api.resend.com";

export type ResendDnsRecord = {
  record: string;
  name: string;
  type: "MX" | "TXT" | "CNAME";
  value: string;
  priority?: number;
  status: string;
};

export type ResendDomain = {
  id: string;
  name: string;
  status: string;
  region: string;
  records: ResendDnsRecord[];
};

export class ResendConfigurationError extends Error {
  constructor() {
    super("Resend API key is not configured.");
    this.name = "ResendConfigurationError";
  }
}

function apiKey() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new ResendConfigurationError();
  return key;
}

async function resendRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${RESEND_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw new Error(`Resend request failed with ${response.status}.`);
  return payload;
}

function normalizeRecord(value: unknown): ResendDnsRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== "string" ||
    typeof record.type !== "string" ||
    !["MX", "TXT", "CNAME"].includes(record.type) ||
    typeof record.value !== "string"
  ) {
    return null;
  }
  return {
    record: typeof record.record === "string" ? record.record : record.type,
    name: record.name,
    type: record.type as ResendDnsRecord["type"],
    value: record.value,
    ...(typeof record.priority === "number"
      ? { priority: record.priority }
      : {}),
    status: typeof record.status === "string" ? record.status : "not_started",
  };
}

function normalizeDomain(value: unknown): ResendDomain | null {
  if (!value || typeof value !== "object") return null;
  const domain = value as Record<string, unknown>;
  if (typeof domain.id !== "string" || typeof domain.name !== "string") {
    return null;
  }
  return {
    id: domain.id,
    name: domain.name.toLowerCase(),
    status: typeof domain.status === "string" ? domain.status : "unknown",
    region: typeof domain.region === "string" ? domain.region : "",
    records: Array.isArray(domain.records)
      ? domain.records.flatMap((record) => {
          const normalized = normalizeRecord(record);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

export async function listResendDomains() {
  const payload = (await resendRequest("/domains")) as {
    data?: unknown;
  } | null;
  if (!Array.isArray(payload?.data)) return [];
  return payload.data.flatMap((domain) => {
    const normalized = normalizeDomain(domain);
    return normalized ? [normalized] : [];
  });
}

export async function getResendDomain(id: string) {
  const domain = normalizeDomain(
    await resendRequest(`/domains/${encodeURIComponent(id)}`),
  );
  if (!domain) throw new Error("Resend returned an invalid domain.");
  return domain;
}

export async function createResendDomain(name: string) {
  const domain = normalizeDomain(
    await resendRequest("/domains", {
      method: "POST",
      body: JSON.stringify({ name, sending: "enabled", receiving: "disabled" }),
    }),
  );
  if (!domain) throw new Error("Resend returned an invalid domain.");
  return domain;
}

export async function verifyResendDomain(id: string) {
  await resendRequest(`/domains/${encodeURIComponent(id)}/verify`, {
    method: "POST",
  });
}
