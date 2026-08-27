import "server-only";

import { getActiveDokployInstanceSummary } from "./active-instance";
import { getDokployProjects, getFreshDokployProjects } from "./projects";
import type { DokployProject } from "./types";
import { getDokployMemoryRevision } from "./instance-memory-state";

type SnapshotEntry = {
  projects: DokployProject[];
  updatedAt: number | null;
  error: string;
  refreshPromise: Promise<void> | null;
  revision: number;
};

type SnapshotStore = Map<string, SnapshotEntry>;
type ProjectSnapshot = {
  projects: DokployProject[];
  updatedAt: number | null;
  refreshing: boolean;
  error: string;
};

const globalSnapshots = globalThis as typeof globalThis & {
  __dokploySidebarProjectSnapshots?: SnapshotStore;
};

const snapshots = globalSnapshots.__dokploySidebarProjectSnapshots ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalSnapshots.__dokploySidebarProjectSnapshots = snapshots;
}

function getOrCreateEntry(instanceId: string) {
  const existing = snapshots.get(instanceId);
  if (existing) return existing;

  const entry: SnapshotEntry = {
    projects: [],
    updatedAt: null,
    error: "",
    refreshPromise: null,
    revision: getDokployMemoryRevision(instanceId),
  };
  snapshots.set(instanceId, entry);
  return entry;
}

export function readSidebarProjectSnapshot(
  instanceId: string,
): ProjectSnapshot {
  const entry = snapshots.get(instanceId);
  return {
    projects: entry?.projects ?? [],
    updatedAt: entry?.updatedAt ?? null,
    refreshing: Boolean(entry?.refreshPromise),
    error: entry?.error ?? "",
  };
}

export async function getSidebarProjectSnapshot(
  instanceId: string,
  loadProjects: () => Promise<DokployProject[]>,
  options: { forceRefresh?: boolean } = {},
): Promise<ProjectSnapshot> {
  const entry = getOrCreateEntry(instanceId);
  const revision = getDokployMemoryRevision(instanceId);
  if (entry.revision !== revision) {
    entry.projects = [];
    entry.updatedAt = null;
    entry.error = "";
    entry.refreshPromise = null;
    entry.revision = revision;
  }
  const stale = entry.updatedAt === null;

  if ((options.forceRefresh || stale) && !entry.refreshPromise) {
    const refreshRevision = entry.revision;
    const refreshPromise = loadProjects()
      .then((projects) => {
        if (entry.revision !== refreshRevision) return;
        entry.projects = projects;
        entry.updatedAt = Date.now();
        entry.error = "";
      })
      .catch(() => {
        if (entry.revision !== refreshRevision) return;
        entry.error = "Unable to load projects.";
      })
      .finally(() => {
        if (entry.refreshPromise === refreshPromise) {
          entry.refreshPromise = null;
        }
      });
    entry.refreshPromise = refreshPromise;
  }

  // There is nothing useful to render on a cold cache, so let this API request
  // wait for the first snapshot. Page rendering never waits on this promise.
  if (entry.updatedAt === null && entry.refreshPromise) {
    await entry.refreshPromise;
  }

  return readSidebarProjectSnapshot(instanceId);
}

export async function getActiveDokployProjectSnapshot(
  options: {
    forceRefresh?: boolean;
  } = {},
): Promise<DokployProject[]> {
  const instance = await getActiveDokployInstanceSummary();
  if (!instance) return [];
  const snapshot = await getSidebarProjectSnapshot(
    instance.id,
    getDokployProjects,
    options,
  );
  return snapshot.projects;
}

export async function getActiveDokployProjectFromSnapshot(
  projectId: string,
): Promise<DokployProject | null> {
  const projects = await getActiveDokployProjectSnapshot();
  return projects.find((project) => project.projectId === projectId) ?? null;
}

export function clearSidebarProjectSnapshot(instanceId: string) {
  snapshots.delete(instanceId);
}

export async function refreshSidebarProjectSnapshot(instanceId: string) {
  clearSidebarProjectSnapshot(instanceId);
  return getSidebarProjectSnapshot(instanceId, getFreshDokployProjects, {
    forceRefresh: true,
  });
}
