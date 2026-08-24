import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
  bootstrapLegacyDokployInstance,
  getDokployInstance,
  getDokployInstanceSummary,
  listDokployInstances,
} from "@/lib/storage/dokploy-instances";
import { getDokployProvisioningJob } from "@/lib/storage/dokploy-provisioning";

export const ACTIVE_DOKPLOY_COOKIE = "active_dokploy_id";

export const getActiveDokployInstanceId = cache(async () => {
  bootstrapLegacyDokployInstance();
  return (await cookies()).get(ACTIVE_DOKPLOY_COOKIE)?.value ?? null;
});

export const getActiveDokployInstanceSummary = cache(async () => {
  const instanceId = await getActiveDokployInstanceId();
  if (!instanceId) return null;
  const instance = getDokployInstanceSummary(instanceId);
  if (instance) return instance;
  const completedInstanceId = getDokployProvisioningJob(instanceId)?.instanceId;
  return completedInstanceId
    ? getDokployInstanceSummary(completedInstanceId)
    : null;
});

export const getActiveDokployConfiguration = cache(async () => {
  const instanceId = await getActiveDokployInstanceId();
  if (!instanceId) return null;
  const instance = getDokployInstance(instanceId);
  if (instance) return instance;
  const completedInstanceId = getDokployProvisioningJob(instanceId)?.instanceId;
  return completedInstanceId ? getDokployInstance(completedInstanceId) : null;
});

export function getDokployInstanceSummaries() {
  bootstrapLegacyDokployInstance();
  return listDokployInstances();
}
