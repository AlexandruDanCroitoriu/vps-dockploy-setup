import "server-only";

import { createHash } from "node:crypto";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const BUCKET_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export type CloudflareR2Bucket = {
  name: string;
  creationDate: string;
  location: string;
  jurisdiction: string;
  storageClass: string;
};

export class CloudflareR2ConfigurationError extends Error {
  constructor() {
    super("Cloudflare R2 management is not configured.");
    this.name = "CloudflareR2ConfigurationError";
  }
}

function configuration() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  if (!ACCOUNT_ID_PATTERN.test(accountId) || !token) {
    throw new CloudflareR2ConfigurationError();
  }
  return { accountId, token };
}

let cachedS3Credentials:
  { token: string; accessKeyId: string; secretAccessKey: string } | undefined;

export async function getCloudflareR2S3Credentials() {
  const { accountId, token } = configuration();
  if (cachedS3Credentials?.token === token) {
    return {
      accessKeyId: cachedS3Credentials.accessKeyId,
      secretAccessKey: cachedS3Credentials.secretAccessKey,
    };
  }
  type VerificationPayload = {
    success?: unknown;
    result?: { id?: unknown; status?: unknown };
    errors?: Array<{ message?: unknown }>;
  } | null;
  let response: Response | undefined;
  let payload: VerificationPayload = null;
  for (const path of [
    "/user/tokens/verify",
    `/accounts/${accountId}/tokens/verify`,
  ]) {
    response = await fetch(`${CLOUDFLARE_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    payload = (await response.json().catch(() => null)) as VerificationPayload;
    if (response.ok && payload?.success === true) break;
  }
  const accessKeyId = payload?.result?.id;
  if (
    !response?.ok ||
    payload?.success !== true ||
    payload.result?.status !== "active" ||
    typeof accessKeyId !== "string"
  ) {
    const message = payload?.errors?.find(
      (error) => typeof error.message === "string",
    )?.message;
    throw new Error(
      typeof message === "string"
        ? message
        : "Cloudflare could not derive R2 S3 credentials from the configured API token.",
    );
  }
  cachedS3Credentials = {
    token,
    accessKeyId,
    secretAccessKey: createHash("sha256").update(token).digest("hex"),
  };
  return {
    accessKeyId: cachedS3Credentials.accessKeyId,
    secretAccessKey: cachedS3Credentials.secretAccessKey,
  };
}

export function getCloudflareR2S3Endpoint() {
  const { accountId } = configuration();
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function normalizeBucket(value: unknown): CloudflareR2Bucket | null {
  if (!value || typeof value !== "object") return null;
  const bucket = value as Record<string, unknown>;
  if (typeof bucket.name !== "string") return null;
  return {
    name: bucket.name,
    creationDate:
      typeof bucket.creation_date === "string" ? bucket.creation_date : "",
    location: typeof bucket.location === "string" ? bucket.location : "auto",
    jurisdiction:
      typeof bucket.jurisdiction === "string" ? bucket.jurisdiction : "default",
    storageClass:
      typeof bucket.storage_class === "string"
        ? bucket.storage_class
        : "Standard",
  };
}

async function request(path: string, init?: RequestInit) {
  const { accountId, token } = configuration();
  const response = await fetch(
    `${CLOUDFLARE_API_URL}/accounts/${accountId}/r2/buckets${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    success?: unknown;
    result?: unknown;
    errors?: Array<{ message?: unknown }>;
  } | null;
  if (!response.ok || payload?.success !== true) {
    const message = payload?.errors?.find(
      (error) => typeof error.message === "string",
    )?.message;
    throw new Error(
      typeof message === "string"
        ? message
        : "Cloudflare rejected the R2 request.",
    );
  }
  return payload.result;
}

export function isValidR2BucketName(value: string) {
  return BUCKET_NAME_PATTERN.test(value);
}

export async function listCloudflareR2Buckets() {
  const result = await request("?per_page=1000");
  const buckets =
    result && typeof result === "object" && "buckets" in result
      ? (result as { buckets?: unknown }).buckets
      : result;
  return (Array.isArray(buckets) ? buckets : [])
    .flatMap((bucket) => {
      const normalized = normalizeBucket(bucket);
      return normalized ? [normalized] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createCloudflareR2Bucket(name: string) {
  if (!isValidR2BucketName(name)) {
    throw new Error(
      "Bucket names must be 3–63 characters using lowercase letters, numbers, and hyphens.",
    );
  }
  await request("", { method: "POST", body: JSON.stringify({ name }) });
}

export async function deleteCloudflareR2Bucket(name: string) {
  if (!isValidR2BucketName(name)) throw new Error("Invalid R2 bucket name.");
  await request(`/${encodeURIComponent(name)}`, { method: "DELETE" });
}
