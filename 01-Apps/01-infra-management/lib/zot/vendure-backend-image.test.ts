import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./active-registry", () => ({ getActiveZotRegistry: vi.fn() }));
vi.mock("./registry-images", () => ({ getZotRegistryImages: vi.fn() }));

import { getActiveZotRegistry } from "./active-registry";
import { getZotRegistryImages } from "./registry-images";
import { getVendureBackendZotImage } from "./vendure-backend-image";

describe("Vendure backend Zot image", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the active registry image when latest is present", async () => {
    vi.mocked(getActiveZotRegistry).mockResolvedValue({
      host: "zot.example.com",
      username: "admin",
      password: "secret",
    });
    vi.mocked(getZotRegistryImages).mockResolvedValue([
      { tag: "latest" },
    ] as Awaited<ReturnType<typeof getZotRegistryImages>>);

    await expect(getVendureBackendZotImage()).resolves.toMatchObject({
      available: true,
      image: "zot.example.com/online-store-vendure-server:latest",
    });
  });

  it("is unavailable when latest is absent", async () => {
    vi.mocked(getActiveZotRegistry).mockResolvedValue({
      host: "zot.example.com",
      username: "admin",
      password: "secret",
    });
    vi.mocked(getZotRegistryImages).mockResolvedValue([]);

    await expect(getVendureBackendZotImage()).resolves.toMatchObject({
      available: false,
      message:
        "Zot registry does not contain online-store-vendure-server:latest.",
    });
  });
});
