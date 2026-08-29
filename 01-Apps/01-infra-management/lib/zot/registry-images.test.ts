import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deleteZotRegistryImage,
  getFreshZotRegistryImages,
  getZotRegistryImageConfigDigest,
  getZotRegistryImages,
  invalidateZotRegistryMemoryState,
  normalizeZotRegistryImages,
  removeCurrentZotRegistryImage,
} from "./registry-images";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Zot registry image normalization", () => {
  it("uses tag time as the publish date and sorts newest first", () => {
    expect(
      normalizeZotRegistryImages({
        data: {
          ImageList: {
            Results: [
              {
                RepoName: "infra-management",
                Tag: "v1",
                Digest: "sha256:one",
                PushTimestamp: "2026-01-01T10:00:00Z",
              },
              {
                RepoName: "infra-management",
                Tag: "v2",
                Digest: "sha256:two",
                TaggedTimestamp: "2026-02-01T10:00:00Z",
                LastUpdated: "2025-01-01T10:00:00Z",
              },
            ],
          },
        },
      }),
    ).toEqual([
      {
        name: "infra-management",
        tag: "v2",
        digest: "sha256:two",
        publishedAt: "2026-02-01T10:00:00Z",
        current: true,
      },
      {
        name: "infra-management",
        tag: "v1",
        digest: "sha256:one",
        publishedAt: "2026-01-01T10:00:00Z",
        current: false,
      },
    ]);
  });

  it("deletes the selected Zot repository tag with basic authentication", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteZotRegistryImage(
      {
        host: "zot.example.com",
        username: "operator",
        password: "registry-password",
      },
      "infra-management",
      "v1.2.3",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://zot.example.com/v2/infra-management/manifests/v1.2.3",
      expect.objectContaining({
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from("operator:registry-password").toString("base64")}`,
        },
      }),
    );
  });

  it("fetches image versions again after the registry cache is invalidated", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { ImageList: { Results: [] } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const registry = {
      host: "refresh-zot.example.com",
      username: "operator",
      password: "registry-password",
    };

    await getZotRegistryImages(registry, "infra-management");
    await getZotRegistryImages(registry, "infra-management");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateZotRegistryMemoryState(registry.host);
    await getZotRegistryImages(registry, "infra-management");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("always reloads fresh image versions for project page renders", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ data: { ImageList: { Results: [] } } }),
          ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const registry = {
      host: "fresh-zot.example.com",
      username: "operator",
      password: "registry-password",
    };

    await getFreshZotRegistryImages(registry, "infra-management");
    await getFreshZotRegistryImages(registry, "infra-management");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads the image config digest used to match a local Docker image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ config: { digest: "sha256:local-image-id" } }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getZotRegistryImageConfigDigest(
        {
          host: "zot.example.com",
          username: "operator",
          password: "registry-password",
        },
        "infra-management",
        "latest",
      ),
    ).resolves.toBe("sha256:local-image-id");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://zot.example.com/v2/infra-management/manifests/latest",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("removes the current tag before a replacement image is pushed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              ImageList: {
                Results: [
                  {
                    RepoName: "infra-management",
                    Tag: "latest",
                    Digest: "sha256:old",
                    TaggedTimestamp: "2026-08-27T10:00:00Z",
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const registry = {
      host: "replace-zot.example.com",
      username: "operator",
      password: "registry-password",
    };

    await expect(
      removeCurrentZotRegistryImage(registry, "infra-management"),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://replace-zot.example.com/v2/infra-management/manifests/latest",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
