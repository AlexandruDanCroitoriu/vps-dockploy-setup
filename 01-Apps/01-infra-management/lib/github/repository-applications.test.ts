import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getRepositoryApplications } from "./repository-applications";

describe("repository application discovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns only sorted folders from the configured apps directory", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { type: "file", name: "README.md", path: "01-Apps/README.md" },
          { type: "dir", name: "02-site", path: "01-Apps/02-site" },
          { type: "dir", name: "01-api", path: "01-Apps/01-api" },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRepositoryApplications()).resolves.toEqual([
      {
        name: "01-api",
        path: "01-Apps/01-api",
        owner: "AlexandruDanCroitoriu",
        repository: "vps-dockploy-setup",
        branch: "main",
      },
      {
        name: "02-site",
        path: "01-Apps/02-site",
        owner: "AlexandruDanCroitoriu",
        repository: "vps-dockploy-setup",
        branch: "main",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0].toString()).toContain(
      "/contents/01-Apps?ref=main",
    );
  });

  it("rejects failed GitHub responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 403 })),
    );

    await expect(getRepositoryApplications()).rejects.toThrow(
      "GitHub repository lookup failed (403).",
    );
  });
});
