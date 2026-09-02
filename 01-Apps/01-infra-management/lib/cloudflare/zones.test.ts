import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CloudflareConfigurationError,
  createCloudflareDnsRecord,
  deleteCloudflareDnsRecord,
  ensureCloudflareARecord,
  getCloudflareZones,
  invalidateCloudflareZones,
  renameCloudflareDnsRecord,
  updateCloudflareDnsRecord,
} from "./zones";

const originalToken = process.env.CLOUDFLARE_API_TOKEN;

afterEach(() => {
  invalidateCloudflareZones();
  vi.unstubAllGlobals();
  if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
  else process.env.CLOUDFLARE_API_TOKEN = originalToken;
});

describe("Cloudflare zones", () => {
  it("requires a configured API token", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;

    await expect(getCloudflareZones()).rejects.toBeInstanceOf(
      CloudflareConfigurationError,
    );
  });

  it("loads every page and returns safe, sorted zone details", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "secret-token";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                id: "zone-b",
                name: "zeta.example",
                status: "active",
                paused: false,
                account: { id: "private-account" },
              },
            ],
            result_info: { page: 1, total_pages: 2 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                id: "zone-a",
                name: "alpha.example",
                status: "pending",
                paused: true,
              },
            ],
            result_info: { page: 2, total_pages: 2 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                id: "apex",
                name: "alpha.example",
                type: "A",
                content: "192.0.2.10",
              },
              {
                id: "api-v4",
                name: "api.alpha.example",
                type: "A",
                content: "192.0.2.1",
                proxied: true,
              },
              {
                id: "api-v6",
                name: "api.alpha.example",
                type: "AAAA",
                content: "2001:db8::1",
              },
              {
                id: "www",
                name: "www.alpha.example",
                type: "CNAME",
                content: "alpha.example",
              },
            ],
            result_info: { page: 1, total_pages: 2 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                id: "zeta-apex",
                name: "ZETA.EXAMPLE.",
                type: "A",
                content: "198.51.100.7",
              },
              {
                id: "app",
                name: "app.zeta.example",
                type: "A",
                content: "198.51.100.7",
              },
            ],
            result_info: { page: 1, total_pages: 1 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                id: "admin",
                name: "admin.alpha.example",
                type: "CNAME",
                content: "target.example",
              },
            ],
            result_info: { page: 2, total_pages: 2 },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCloudflareZones()).resolves.toEqual([
      {
        id: "zone-a",
        name: "alpha.example",
        status: "pending",
        paused: true,
        ipAddress: "192.0.2.10",
        apexARecordId: "apex",
        subdomains: [
          {
            id: "admin",
            name: "admin.alpha.example",
            type: "CNAME",
            content: "target.example",
            proxied: false,
          },
          {
            id: "api-v4",
            name: "api.alpha.example",
            type: "A",
            content: "192.0.2.1",
            proxied: true,
          },
          {
            id: "api-v6",
            name: "api.alpha.example",
            type: "AAAA",
            content: "2001:db8::1",
            proxied: false,
          },
          {
            id: "www",
            name: "www.alpha.example",
            type: "CNAME",
            content: "alpha.example",
            proxied: false,
          },
        ],
      },
      {
        id: "zone-b",
        name: "zeta.example",
        status: "active",
        paused: false,
        ipAddress: "198.51.100.7",
        apexARecordId: "zeta-apex",
        subdomains: [
          {
            id: "app",
            name: "app.zeta.example",
            type: "A",
            content: "198.51.100.7",
            proxied: false,
          },
        ],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.cloudflare.com/client/v4/zones?page=1&per_page=50",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
        cache: "no-store",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.cloudflare.com/client/v4/zones/zone-a/dns_records?page=1&per_page=5000",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("returns a safe error when Cloudflare rejects the request", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "secret-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: "token secret-token is invalid" }],
          }),
          { status: 403 },
        ),
      ),
    );

    await expect(getCloudflareZones()).rejects.toThrow(
      "Unable to load domains from Cloudflare.",
    );
  });

  it("creates, renames, and deletes individual DNS records", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "secret-token";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify({ success: true, result: {} })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createCloudflareDnsRecord({
      zoneId: "zone-id",
      name: "app.example.com",
      type: "CNAME",
      content: "target.example.com",
      proxied: true,
    });
    await renameCloudflareDnsRecord({
      zoneId: "zone-id",
      recordId: "record-id",
      name: "web.example.com",
    });
    await updateCloudflareDnsRecord({
      zoneId: "zone-id",
      recordId: "record-id",
      content: "192.0.2.25",
    });
    await deleteCloudflareDnsRecord({
      zoneId: "zone-id",
      recordId: "record-id",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.cloudflare.com/client/v4/zones/zone-id/dns_records",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "app.example.com",
          type: "CNAME",
          content: "target.example.com",
          ttl: 1,
          proxied: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.cloudflare.com/client/v4/zones/zone-id/dns_records/record-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "web.example.com" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.cloudflare.com/client/v4/zones/zone-id/dns_records/record-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ content: "192.0.2.25" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.cloudflare.com/client/v4/zones/zone-id/dns_records/record-id",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates a missing hostname A record with the instance IP", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "secret-token";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [
              {
                id: "zone-id",
                name: "example.com",
                status: "active",
                paused: false,
              },
            ],
            result_info: { page: 1, total_pages: 1 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            result: [],
            result_info: { page: 1, total_pages: 1 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, result: {} })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await ensureCloudflareARecord({
      hostname: "app.example.com",
      ipAddress: "203.0.113.10",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.cloudflare.com/client/v4/zones/zone-id/dns_records",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "app.example.com",
          type: "A",
          content: "203.0.113.10",
          ttl: 1,
          proxied: false,
        }),
      }),
    );
  });
});
