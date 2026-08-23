import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import {
  bootstrapLegacyDokployInstance,
  getDokployInstance,
  getDokployInstanceSummary,
  listDokployInstances,
} from "@/lib/storage/dokploy-instances";

export const ACTIVE_DOKPLOY_COOKIE = "active_dokploy_id";

const getActiveDokployInstanceId = cache(async () => {
  bootstrapLegacyDokployInstance();
  return (await cookies()).get(ACTIVE_DOKPLOY_COOKIE)?.value ?? null;
});

export const getActiveDokployInstanceSummary = cache(async () => {
  const instanceId = await getActiveDokployInstanceId();
  return instanceId ? getDokployInstanceSummary(instanceId) : null;
});

export const getActiveDokployConfiguration = cache(async () => {
  const instanceId = await getActiveDokployInstanceId();
  return instanceId ? getDokployInstance(instanceId) : null;
});

export function getDokployInstanceSummaries() {
  bootstrapLegacyDokployInstance();
  return listDokployInstances();
}
