import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CloudflareR2ConfigurationError,
  createCloudflareR2Bucket,
  deleteCloudflareR2Bucket,
  getCloudflareR2S3Credentials,
  listCloudflareR2Buckets,
} from "./r2";

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "cloudflare-token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cloudflare R2 buckets", () => {
  it("lists normalized buckets", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            buckets: [
              {
                name: "backups",
                creation_date: "2026-01-01T00:00:00Z",
                location: "weur",
                jurisdiction: "default",
                storage_class: "Standard",
              },
            ],
          },
        }),
      ),
    );

    await expect(listCloudflareR2Buckets()).resolves.toEqual([
      expect.objectContaining({ name: "backups", location: "weur" }),
    ]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/accounts/0123456789abcdef0123456789abcdef/r2/buckets?per_page=1000",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer cloudflare-token",
        }),
      }),
    );
  });

  it("creates and deletes validated bucket names", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      new Response(JSON.stringify({ success: true, result: {} })),
    );

    await createCloudflareR2Bucket("vendure-backups");
    await deleteCloudflareR2Bucket("vendure-backups");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/r2\/buckets$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "vendure-backups" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/r2\/buckets\/vendure-backups$/),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("derives S3 credentials from the active Cloudflare API token", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            id: "0123456789abcdef0123456789abcdef",
            status: "active",
          },
        }),
      ),
    );

    await expect(getCloudflareR2S3Credentials()).resolves.toEqual({
      accessKeyId: "0123456789abcdef0123456789abcdef",
      secretAccessKey:
        "60ff72ad09ea26c088fbf51b30e2f9c69766145a351c80bffdfd075f25724950",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/user\/tokens\/verify$/),
      expect.objectContaining({
        headers: { Authorization: "Bearer cloudflare-token" },
      }),
    );
  });

  it("falls back to account-token verification", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "account-cloudflare-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: "Invalid user token" }],
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: {
              id: "fedcba9876543210fedcba9876543210",
              status: "active",
            },
          }),
        ),
      );

    await expect(getCloudflareR2S3Credentials()).resolves.toEqual(
      expect.objectContaining({
        accessKeyId: "fedcba9876543210fedcba9876543210",
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/accounts\/.+\/tokens\/verify$/),
      expect.anything(),
    );
  });

  it("rejects missing configuration and invalid names", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    await expect(listCloudflareR2Buckets()).rejects.toBeInstanceOf(
      CloudflareR2ConfigurationError,
    );
    await expect(createCloudflareR2Bucket("Invalid_Name")).rejects.toThrow(
      "Bucket names",
    );
  });
});
