import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deleteZotRegistryImage,
  normalizeZotRegistryImages,
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
});
