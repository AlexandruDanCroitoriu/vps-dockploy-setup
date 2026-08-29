import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./active-registry", () => ({ getActiveZotRegistry: vi.fn() }));
vi.mock("./registry-images", () => ({ getZotRegistryImages: vi.fn() }));

import { getActiveZotRegistry } from "./active-registry";
import { getZotRegistryImages } from "./registry-images";
import { getVendureStorefrontZotImage } from "./vendure-storefront-image";

describe("Vendure storefront Zot image", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the image repository matching the storefront folder", async () => {
    vi.mocked(getActiveZotRegistry).mockResolvedValue({
      host: "zot.example.com",
      username: "admin",
      password: "secret",
    });
    vi.mocked(getZotRegistryImages).mockResolvedValue([
      { tag: "latest" },
    ] as Awaited<ReturnType<typeof getZotRegistryImages>>);

    await expect(
      getVendureStorefrontZotImage(
        "/01-Apps/02-Online-Store-Vendure/apps/storefront-clean",
      ),
    ).resolves.toMatchObject({
      available: true,
      image: "zot.example.com/online-store-vendure-storefront-clean:latest",
    });
  });
});
