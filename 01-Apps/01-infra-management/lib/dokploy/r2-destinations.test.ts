import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cloudflare/r2", () => ({
  getCloudflareR2S3Credentials: vi.fn(),
  listCloudflareR2Buckets: vi.fn(),
}));
vi.mock("@/lib/storage/dokploy-instances", () => ({
  getDokployInstance: vi.fn(),
  listDokployInstances: vi.fn(),
}));
vi.mock("./client", () => ({
  dokployGetWithConfiguration: vi.fn(),
  dokployPostWithConfiguration: vi.fn(),
}));

import { getCloudflareR2S3Credentials } from "@/lib/cloudflare/r2";
import {
  getDokployInstance,
  listDokployInstances,
} from "@/lib/storage/dokploy-instances";
import {
  dokployGetWithConfiguration,
  dokployPostWithConfiguration,
} from "./client";
import { syncR2BucketToAllDokployInstances } from "./r2-destinations";

const instance = {
  id: "instance-1",
  name: "Production",
  rootUrl: "https://dokploy.example.com",
  rootDomain: "example.com",
  vpsIp: "203.0.113.10",
  vpsPassword: "root-password",
  apiKey: "dokploy-key",
  defaultServiceUsername: "admin@example.com",
  defaultServicePassword: "password",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
  vi.mocked(getCloudflareR2S3Credentials).mockResolvedValue({
    accessKeyId: "r2-access-key",
    secretAccessKey: "r2-secret-key",
  });
  vi.mocked(listDokployInstances).mockReturnValue([instance]);
  vi.mocked(getDokployInstance).mockReturnValue(instance);
  vi.mocked(dokployGetWithConfiguration).mockResolvedValue([]);
  vi.mocked(dokployPostWithConfiguration).mockResolvedValue({});
});

describe("R2 Dokploy destination synchronization", () => {
  it("creates the bucket destination on every instance", async () => {
    await expect(
      syncR2BucketToAllDokployInstances("vendure-backups"),
    ).resolves.toEqual([
      expect.objectContaining({ instanceId: "instance-1", synced: true }),
    ]);
    expect(dokployPostWithConfiguration).toHaveBeenCalledWith(
      { baseUrl: instance.rootUrl, apiKey: instance.apiKey },
      "destination.create",
      {
        name: "Infra Management R2 · vendure-backups",
        provider: "Cloudflare",
        accessKey: "r2-access-key",
        bucket: "vendure-backups",
        region: "auto",
        endpoint:
          "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
        secretAccessKey: "r2-secret-key",
        additionalFlags: [],
      },
    );
  });

  it("updates an existing managed destination", async () => {
    vi.mocked(dokployGetWithConfiguration).mockResolvedValue([
      {
        destinationId: "destination-1",
        name: "Infra Management R2 · vendure-backups",
      },
    ]);

    await syncR2BucketToAllDokployInstances("vendure-backups");

    expect(dokployPostWithConfiguration).toHaveBeenCalledWith(
      expect.anything(),
      "destination.update",
      expect.objectContaining({ destinationId: "destination-1" }),
    );
  });
});
