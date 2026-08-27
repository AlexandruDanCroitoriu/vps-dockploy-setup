import "server-only";

import type { CloudflareZone } from "./zones";

type CloudflareSnapshot = {
  value?: CloudflareZone[];
  promise?: Promise<CloudflareZone[]>;
};

const globalState = globalThis as typeof globalThis & {
  __cloudflareZonesSnapshot?: CloudflareSnapshot;
};

const snapshot =
  globalState.__cloudflareZonesSnapshot ??
  (globalState.__cloudflareZonesSnapshot = {});

export async function getCloudflareZonesSnapshot(
  loader: () => Promise<CloudflareZone[]>,
) {
  if (snapshot.value) return snapshot.value;
  if (snapshot.promise) return snapshot.promise;

  snapshot.promise = loader()
    .then((zones) => {
      snapshot.value = zones;
      delete snapshot.promise;
      return zones;
    })
    .catch((error) => {
      delete snapshot.promise;
      throw error;
    });
  return snapshot.promise;
}

export function invalidateCloudflareZonesSnapshot() {
  delete snapshot.value;
  delete snapshot.promise;
}
