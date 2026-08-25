import { describe, expect, it, vi } from "vitest";
import {
  getSidebarProjectSnapshot,
  readSidebarProjectSnapshot,
} from "./sidebar-project-snapshot";

const projects = [
  {
    projectId: "project-1",
    name: "Main",
    description: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    env: "",
    environments: [],
  },
];

describe("sidebar project snapshots", () => {
  it("deduplicates concurrent cold-cache refreshes", async () => {
    let resolveLoad: (value: typeof projects) => void = () => undefined;
    const loader = vi.fn(
      () =>
        new Promise<typeof projects>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const instanceId = crypto.randomUUID();

    const first = getSidebarProjectSnapshot(instanceId, loader);
    const second = getSidebarProjectSnapshot(instanceId, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoad(projects);
    await expect(first).resolves.toMatchObject({ projects, refreshing: false });
    await expect(second).resolves.toMatchObject({
      projects,
      refreshing: false,
    });
  });

  it("returns existing data while a forced refresh runs", async () => {
    const instanceId = crypto.randomUUID();
    await getSidebarProjectSnapshot(instanceId, async () => projects);

    let resolveRefresh: (value: typeof projects) => void = () => undefined;
    const refresh = getSidebarProjectSnapshot(
      instanceId,
      () =>
        new Promise<typeof projects>((resolve) => {
          resolveRefresh = resolve;
        }),
      { forceRefresh: true },
    );

    await expect(refresh).resolves.toMatchObject({
      projects,
      refreshing: true,
    });
    resolveRefresh([{ ...projects[0], name: "Updated" }]);
    await vi.waitFor(() => {
      expect(readSidebarProjectSnapshot(instanceId)).toMatchObject({
        projects: [{ ...projects[0], name: "Updated" }],
        refreshing: false,
      });
    });
  });

  it("keeps the last successful snapshot when refresh fails", async () => {
    const instanceId = crypto.randomUUID();
    await getSidebarProjectSnapshot(instanceId, async () => projects);
    await getSidebarProjectSnapshot(
      instanceId,
      async () => {
        throw new Error("offline");
      },
      { forceRefresh: true },
    );

    await vi.waitFor(() => {
      expect(readSidebarProjectSnapshot(instanceId)).toMatchObject({
        projects,
        error: "Unable to load projects.",
        refreshing: false,
      });
    });
  });
});
