import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
  bootstrapLegacyDokployInstance,
  getDokployInstance,
  getDokployInstanceSummary,
  listDokployInstances,
} from "@/lib/storage/dokploy-instances";
import {
  getDokployProvisioningJob,
  getDokployProvisioningJobByInstanceId,
} from "@/lib/storage/dokploy-provisioning";

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

export const getActiveDokployProvisioningJob = cache(async () => {
  const activeId = await getActiveDokployInstanceId();
  if (!activeId) return null;
  return (
    getDokployProvisioningJob(activeId) ??
    getDokployProvisioningJobByInstanceId(activeId)
  );
});

export const getActiveDokployConfiguration = cache(async () => {
  const instanceId = await getActiveDokployInstanceId();
  if (!instanceId) return null;
  const instance = getDokployInstance(instanceId);
  if (instance) return withOperationalApiUrl(instance);
  const completedInstanceId = getDokployProvisioningJob(instanceId)?.instanceId;
  const completedInstance = completedInstanceId
    ? getDokployInstance(completedInstanceId)
    : null;
  return completedInstance ? withOperationalApiUrl(completedInstance) : null;
});

function withOperationalApiUrl(
  instance: NonNullable<ReturnType<typeof getDokployInstance>>,
) {
  const job = getDokployProvisioningJobByInstanceId(instance.id);
  const useSetupAddress =
    job?.status !== "complete" &&
    job?.steps["api-key"] === "done" &&
    Boolean(instance.vpsIp);
  return {
    ...instance,
    apiBaseUrl: useSetupAddress
      ? `http://${instance.vpsIp}:3000`
      : instance.rootUrl,
  };
}

export function getDokployInstanceSummaries() {
  bootstrapLegacyDokployInstance();
  return listDokployInstances();
}
