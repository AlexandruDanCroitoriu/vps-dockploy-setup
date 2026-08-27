import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getCloudflareZonesSnapshot,
  invalidateCloudflareZonesSnapshot,
} from "./memory-state";

afterEach(() => invalidateCloudflareZonesSnapshot());

describe("Cloudflare server snapshot", () => {
  it("loads once and reuses the zone state on later page renders", async () => {
    const zones = [
      {
        id: "zone-id",
        name: "example.com",
        status: "active",
        paused: false,
        ipAddress: "192.0.2.1",
        subdomains: [],
      },
    ];
    const loader = vi.fn().mockResolvedValue(zones);

    await expect(getCloudflareZonesSnapshot(loader)).resolves.toBe(zones);
    await expect(getCloudflareZonesSnapshot(loader)).resolves.toBe(zones);

    expect(loader).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent initial requests", async () => {
    let resolve!: (zones: []) => void;
    const loader = vi.fn(
      () => new Promise<[]>((complete) => (resolve = complete)),
    );

    const first = getCloudflareZonesSnapshot(loader);
    const second = getCloudflareZonesSnapshot(loader);
    resolve([]);

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(loader).toHaveBeenCalledOnce();
  });

  it("loads fresh state after invalidation", async () => {
    const loader = vi.fn().mockResolvedValue([]);

    await getCloudflareZonesSnapshot(loader);
    invalidateCloudflareZonesSnapshot();
    await getCloudflareZonesSnapshot(loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
