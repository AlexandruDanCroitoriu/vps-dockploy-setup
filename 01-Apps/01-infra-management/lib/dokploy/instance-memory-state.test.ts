import { describe, expect, it, vi } from "vitest";
import {
  getExternalRequestSnapshot,
  invalidateDokployMemoryState,
} from "./instance-memory-state";

describe("Dokploy external request snapshots", () => {
  it("reuses a successful response until the instance is invalidated", async () => {
    const instanceId = crypto.randomUUID();
    const loader = vi.fn().mockResolvedValue({ status: "running" });

    await expect(
      getExternalRequestSnapshot(instanceId, "compose.one?id=1", loader),
    ).resolves.toEqual({ status: "running" });
    await expect(
      getExternalRequestSnapshot(instanceId, "compose.one?id=1", loader),
    ).resolves.toEqual({ status: "running" });
    expect(loader).toHaveBeenCalledTimes(1);

    invalidateDokployMemoryState(instanceId);
    await getExternalRequestSnapshot(instanceId, "compose.one?id=1", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("deduplicates simultaneous requests", async () => {
    const instanceId = crypto.randomUUID();
    let resolveLoad: (value: string) => void = () => undefined;
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = getExternalRequestSnapshot(instanceId, "project.all", loader);
    const second = getExternalRequestSnapshot(
      instanceId,
      "project.all",
      loader,
    );
    expect(loader).toHaveBeenCalledTimes(1);
    resolveLoad("projects");
    await expect(Promise.all([first, second])).resolves.toEqual([
      "projects",
      "projects",
    ]);
  });

  it("does not retain failed requests", async () => {
    const instanceId = crypto.randomUUID();
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("recovered");

    await expect(
      getExternalRequestSnapshot(instanceId, "project.all", loader),
    ).rejects.toThrow("offline");
    await expect(
      getExternalRequestSnapshot(instanceId, "project.all", loader),
    ).resolves.toBe("recovered");
  });
});
