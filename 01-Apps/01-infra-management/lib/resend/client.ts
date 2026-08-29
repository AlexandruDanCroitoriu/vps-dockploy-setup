import "server-only";

const RESEND_API_URL = "https://api.resend.com";

export class ResendConfigurationError extends Error {
  constructor() {
    super("RESEND_API_KEY is not configured.");
    this.name = "ResendConfigurationError";
  }
}

type ResendDnsRecord = {
  record: string;
  name: string;
  type: "MX" | "TXT" | "CNAME";
  value: string;
  priority?: number;
  status?: string;
};

export type ResendDomain = {
  id: string;
  name: string;
  status: string;
  records: ResendDnsRecord[];
};

function managementApiKey() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new ResendConfigurationError();
  return key;
}

async function resendRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${RESEND_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${managementApiKey()}`,
      "Content-Type": "application/json",
      "User-Agent": "infra-management/1.0",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`Resend rejected the request (${response.status}).`);
  }
  return payload;
}

function domainFrom(value: unknown): ResendDomain | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  return {
    id: item.id,
    name: item.name,
    status: typeof item.status === "string" ? item.status : "unknown",
    records: Array.isArray(item.records)
      ? item.records.flatMap((candidate) => {
          if (!candidate || typeof candidate !== "object") return [];
          const record = candidate as Record<string, unknown>;
          if (
            typeof record.name !== "string" ||
            typeof record.value !== "string" ||
            !["MX", "TXT", "CNAME"].includes(String(record.type))
          )
            return [];
          return [
            {
              record: typeof record.record === "string" ? record.record : "",
              name: record.name,
              type: record.type as ResendDnsRecord["type"],
              value: record.value,
              ...(typeof record.priority === "number"
                ? { priority: record.priority }
                : {}),
              ...(typeof record.status === "string"
                ? { status: record.status }
                : {}),
            },
          ];
        })
      : [],
  };
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function ensureResendDomain(name: string) {
  const normalized = name.trim().toLowerCase().replace(/\.$/, "");
  const listed = (await resendRequest("/domains")) as { data?: unknown };
  const existing = Array.isArray(listed.data)
    ? listed.data.map(domainFrom).find((domain) => domain?.name === normalized)
    : undefined;
  if (existing) {
    const details = domainFrom(
      await resendRequest(`/domains/${encodeURIComponent(existing.id)}`),
    );
    if (!details)
      throw new Error("Resend returned an invalid domain response.");
    return details;
  }
  const created = domainFrom(
    await resendRequest("/domains", {
      method: "POST",
      body: JSON.stringify({ name: normalized, region: "eu-west-1" }),
    }),
  );
  if (!created) throw new Error("Resend returned an invalid domain response.");
  return created;
}

export async function getResendDomain(domainId: string) {
  const domain = domainFrom(
    await resendRequest(`/domains/${encodeURIComponent(domainId)}`),
  );
  if (!domain) throw new Error("Resend returned an invalid domain response.");
  return domain;
}

export async function verifyResendDomain(domainId: string) {
  await resendRequest(`/domains/${encodeURIComponent(domainId)}/verify`, {
    method: "POST",
  });
}

export async function createResendSendingKey(input: {
  name: string;
  domainId: string;
}) {
  const payload = (await resendRequest("/api-keys", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 50),
      permission: "sending_access",
      domain_id: input.domainId,
    }),
  })) as { token?: unknown };
  if (typeof payload.token !== "string" || !payload.token) {
    throw new Error("Resend did not return the new sending key.");
  }
  return payload.token;
}
