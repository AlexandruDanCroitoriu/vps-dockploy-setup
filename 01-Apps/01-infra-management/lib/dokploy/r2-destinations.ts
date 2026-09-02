import "server-only";

import {
  getCloudflareR2S3Credentials,
  listCloudflareR2Buckets,
} from "@/lib/cloudflare/r2";
import {
  getDokployInstance,
  listDokployInstances,
  type DokployInstanceConfiguration,
} from "@/lib/storage/dokploy-instances";

import {
  dokployGetWithConfiguration,
  dokployPostWithConfiguration,
} from "./client";
import { DokployApiError } from "./errors";
import { isRecord, stringValue, unwrapArray } from "./normalizers";

export const R2_DESTINATION_PREFIX = "Infra Management R2 · ";

function configuration(instance: DokployInstanceConfiguration) {
  return { baseUrl: instance.rootUrl, apiKey: instance.apiKey };
}

function synchronizationError(error: unknown) {
  if (error instanceof DokployApiError) {
    try {
      const payload = JSON.parse(error.details) as { message?: unknown };
      if (typeof payload.message === "string" && payload.message.trim()) {
        return `Dokploy ${error.status}: ${payload.message.trim()}`;
      }
    } catch {
      // Dokploy sometimes returns a plain-text error response.
    }
    return `Dokploy rejected the destination (HTTP ${error.status}).`;
  }
  return error instanceof Error ? error.message : "Synchronization failed.";
}

function endpoint() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new Error("Configure CLOUDFLARE_ACCOUNT_ID first.");
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

async function destinationList(instance: DokployInstanceConfiguration) {
  const payload = await dokployGetWithConfiguration<unknown>(
    configuration(instance),
    "destination.all",
  );
  return unwrapArray(payload, "data", "destinations").filter(isRecord);
}

export async function syncR2BucketToDokployInstance(
  bucket: string,
  instance: DokployInstanceConfiguration,
) {
  const credentials = await getCloudflareR2S3Credentials();
  const name = `${R2_DESTINATION_PREFIX}${bucket}`;
  const existing = (await destinationList(instance)).find(
    (destination) => stringValue(destination.name) === name,
  );
  const body = {
    name,
    provider: "Cloudflare",
    accessKey: credentials.accessKeyId,
    bucket,
    region: "auto",
    endpoint: endpoint(),
    secretAccessKey: credentials.secretAccessKey,
    additionalFlags: [],
  };
  const destinationId = stringValue(existing?.destinationId);
  await dokployPostWithConfiguration(
    configuration(instance),
    destinationId ? "destination.update" : "destination.create",
    destinationId ? { ...body, destinationId } : body,
  );
}

export async function syncR2BucketToAllDokployInstances(bucket: string) {
  const results = await Promise.all(
    listDokployInstances().map(async (summary) => {
      const instance = getDokployInstance(summary.id)!;
      try {
        await syncR2BucketToDokployInstance(bucket, instance);
        return {
          instanceId: instance.id,
          name: instance.name,
          synced: true,
          error: "",
        };
      } catch (error) {
        return {
          instanceId: instance.id,
          name: instance.name,
          synced: false,
          error: synchronizationError(error),
        };
      }
    }),
  );
  return results;
}

export async function syncAllR2BucketsToDokployInstance(instanceId: string) {
  const instance = getDokployInstance(instanceId);
  if (!instance) return;
  for (const bucket of await listCloudflareR2Buckets()) {
    await syncR2BucketToDokployInstance(bucket.name, instance);
  }
}

export async function getR2BucketDestinationStatuses(bucketNames: string[]) {
  return Promise.all(
    listDokployInstances().map(async (summary) => {
      const instance = getDokployInstance(summary.id)!;
      try {
        const names = new Set(
          (await destinationList(instance)).map((destination) =>
            stringValue(destination.name),
          ),
        );
        return {
          instanceId: instance.id,
          instanceName: instance.name,
          buckets: Object.fromEntries(
            bucketNames.map((bucket) => [
              bucket,
              names.has(`${R2_DESTINATION_PREFIX}${bucket}`),
            ]),
          ),
          error: "",
        };
      } catch (error) {
        return {
          instanceId: instance.id,
          instanceName: instance.name,
          buckets: Object.fromEntries(
            bucketNames.map((bucket) => [bucket, false]),
          ),
          error:
            error instanceof Error
              ? error.message
              : "Unable to inspect Dokploy.",
        };
      }
    }),
  );
}

export async function removeR2BucketFromAllDokployInstances(bucket: string) {
  const name = `${R2_DESTINATION_PREFIX}${bucket}`;
  await Promise.all(
    listDokployInstances().map(async (summary) => {
      const instance = getDokployInstance(summary.id)!;
      const destination = (await destinationList(instance)).find(
        (candidate) => stringValue(candidate.name) === name,
      );
      const destinationId = stringValue(destination?.destinationId);
      if (!destinationId) return;
      await dokployPostWithConfiguration(
        configuration(instance),
        "destination.delete",
        { destinationId },
      );
    }),
  );
}
