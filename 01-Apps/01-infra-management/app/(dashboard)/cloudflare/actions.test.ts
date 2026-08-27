import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/cloudflare/zones", () => ({
  createCloudflareDnsRecord: vi.fn(),
  deleteCloudflareDnsRecord: vi.fn(),
  getCloudflareZones: vi.fn(),
  invalidateCloudflareZones: vi.fn(),
  refreshCloudflareZones: vi.fn(),
  renameCloudflareDnsRecord: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import {
  createCloudflareDnsRecord,
  deleteCloudflareDnsRecord,
  getCloudflareZones,
  invalidateCloudflareZones,
  refreshCloudflareZones,
  renameCloudflareDnsRecord,
} from "@/lib/cloudflare/zones";
import {
  createSubdomainAction,
  deleteSubdomainAction,
  refreshCloudflareAction,
  renameSubdomainAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "admin" } });
  vi.mocked(getCloudflareZones).mockResolvedValue([
    {
      id: "zone-id",
      name: "example.com",
      status: "active",
      paused: false,
      ipAddress: "192.0.2.1",
      subdomains: [],
    },
  ]);
});

describe("Cloudflare DNS actions", () => {
  it("requires an authenticated administrator", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    await expect(
      deleteSubdomainAction({ zoneId: "zone-id", recordId: "record-id" }),
    ).resolves.toEqual({
      status: "error",
      message: "Your session has expired.",
    });
    expect(deleteCloudflareDnsRecord).not.toHaveBeenCalled();
  });

  it("creates a validated fully qualified subdomain", async () => {
    await expect(
      createSubdomainAction({
        zoneId: "zone-id",
        zoneName: "example.com",
        label: "api.internal",
      }),
    ).resolves.toEqual({ status: "success", message: "Subdomain created." });

    expect(createCloudflareDnsRecord).toHaveBeenCalledWith({
      zoneId: "zone-id",
      name: "api.internal.example.com",
      type: "A",
      content: "192.0.2.1",
      proxied: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/cloudflare");
    expect(invalidateCloudflareZones).toHaveBeenCalledOnce();
  });

  it("does not create a subdomain when the domain has no apex A record", async () => {
    vi.mocked(getCloudflareZones).mockResolvedValue([
      {
        id: "zone-id",
        name: "example.com",
        status: "active",
        paused: false,
        ipAddress: "",
        subdomains: [],
      },
    ]);

    await expect(
      createSubdomainAction({
        zoneId: "zone-id",
        zoneName: "example.com",
        label: "app",
      }),
    ).resolves.toEqual({
      status: "error",
      message: "This domain does not have an A record IP to copy.",
    });
    expect(createCloudflareDnsRecord).not.toHaveBeenCalled();
  });

  it("renames and deletes a specific record", async () => {
    await renameSubdomainAction({
      zoneId: "zone-id",
      zoneName: "example.com",
      recordId: "record-id",
      label: "web",
    });
    await deleteSubdomainAction({
      zoneId: "zone-id",
      recordId: "record-id",
    });

    expect(renameCloudflareDnsRecord).toHaveBeenCalledWith({
      zoneId: "zone-id",
      recordId: "record-id",
      name: "web.example.com",
    });
    expect(deleteCloudflareDnsRecord).toHaveBeenCalledWith({
      zoneId: "zone-id",
      recordId: "record-id",
    });
    expect(invalidateCloudflareZones).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid names before calling Cloudflare", async () => {
    const result = await renameSubdomainAction({
      zoneId: "zone-id",
      zoneName: "example.com",
      recordId: "record-id",
      label: "not valid",
    });

    expect(result.status).toBe("error");
    expect(renameCloudflareDnsRecord).not.toHaveBeenCalled();
  });

  it("forces a fresh server snapshot when manually refreshed", async () => {
    await expect(refreshCloudflareAction()).resolves.toEqual({
      status: "success",
      message: "Cloudflare domains refreshed.",
    });

    expect(refreshCloudflareZones).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/cloudflare");
  });
});
