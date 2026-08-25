import "server-only";
import { getDokployMemoryRevision } from "./instance-memory-state";

type Entry = {
  value: unknown;
  hasValue: boolean;
  updatedAt: number;
  refreshPromise: Promise<void> | null;
  revision: number;
};

const globalCache = globalThis as typeof globalThis & {
  __dokployRenderSnapshots?: Map<string, Entry>;
};
const snapshots = globalCache.__dokployRenderSnapshots ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalCache.__dokployRenderSnapshots = snapshots;
}

export async function getDokployRenderSnapshot<T>(
  instanceId: string,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const cacheKey = `${instanceId}:${key}`;
  const entry = snapshots.get(cacheKey) ?? {
    value: undefined,
    hasValue: false,
    updatedAt: 0,
    refreshPromise: null,
    revision: getDokployMemoryRevision(instanceId),
  };
  snapshots.set(cacheKey, entry);

  const revision = getDokployMemoryRevision(instanceId);
  if (entry.revision !== revision) {
    entry.value = undefined;
    entry.hasValue = false;
    entry.updatedAt = 0;
    entry.refreshPromise = null;
    entry.revision = revision;
  }

  if (!entry.hasValue && !entry.refreshPromise) {
    entry.refreshPromise = loader()
      .then((value) => {
        entry.value = value;
        entry.hasValue = true;
        entry.updatedAt = Date.now();
      })
      .finally(() => {
        entry.refreshPromise = null;
      });
    // A stale refresh runs after rendering and must not create an unhandled
    // rejection if the upstream instance becomes unavailable.
    if (entry.hasValue) void entry.refreshPromise.catch(() => undefined);
  }

  if (!entry.hasValue && entry.refreshPromise) await entry.refreshPromise;
  return entry.value as T;
}

export function clearDokployRenderSnapshots(instanceId: string) {
  const prefix = `${instanceId}:`;
  for (const key of snapshots.keys()) {
    if (key.startsWith(prefix)) snapshots.delete(key);
  }
}
