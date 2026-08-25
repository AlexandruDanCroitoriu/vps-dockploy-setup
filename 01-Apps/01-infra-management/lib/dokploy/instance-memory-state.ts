import "server-only";

type ExternalRequestEntry = {
  value?: unknown;
  promise?: Promise<unknown>;
};

const globalState = globalThis as typeof globalThis & {
  __dokployExternalRequests?: Map<string, ExternalRequestEntry>;
  __dokployMemoryRevisions?: Map<string, number>;
};

const externalRequests =
  globalState.__dokployExternalRequests ??
  new Map<string, ExternalRequestEntry>();
const revisions =
  globalState.__dokployMemoryRevisions ?? new Map<string, number>();

if (process.env.NODE_ENV !== "production") {
  globalState.__dokployExternalRequests = externalRequests;
  globalState.__dokployMemoryRevisions = revisions;
}

export function getDokployMemoryRevision(instanceId: string) {
  return revisions.get(instanceId) ?? 0;
}

export async function getExternalRequestSnapshot<T>(
  instanceId: string,
  endpoint: string,
  loader: () => Promise<T>,
): Promise<T> {
  const key = `${instanceId}:${endpoint}`;
  const existing = externalRequests.get(key);
  if (existing && "value" in existing) return existing.value as T;
  if (existing?.promise) return existing.promise as Promise<T>;

  const entry: ExternalRequestEntry = {};
  entry.promise = loader()
    .then((value) => {
      entry.value = value;
      delete entry.promise;
      return value;
    })
    .catch((error) => {
      externalRequests.delete(key);
      throw error;
    });
  externalRequests.set(key, entry);
  return entry.promise as Promise<T>;
}

export function invalidateDokployMemoryState(instanceId: string) {
  revisions.set(instanceId, getDokployMemoryRevision(instanceId) + 1);
  const prefix = `${instanceId}:`;
  for (const key of externalRequests.keys()) {
    if (key.startsWith(prefix)) externalRequests.delete(key);
  }
}
