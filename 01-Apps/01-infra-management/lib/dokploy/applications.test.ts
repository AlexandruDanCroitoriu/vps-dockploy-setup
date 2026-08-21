import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({
  dokployGet: vi.fn(),
  dokployPost: vi.fn(),
}));

import { dokployGet, dokployPost } from "./client";
import {
  createDokployGithubApplication,
  getDokployGithubProviders,
  type CreateDokployGithubApplicationInput,
} from "./applications";

const input: CreateDokployGithubApplicationInput = {
  name: "personal-site",
  environmentId: "environment-1",
  githubId: "github-1",
  owner: "owner",
  repository: "monorepo",
  branch: "main",
  buildPath: "/01-Apps/02-personal-site",
  watchPaths: ["01-Apps/02-personal-site/**"],
  buildType: "dockerfile",
  dockerfile: "Dockerfile",
  dockerContextPath: ".",
  autoDeploy: true,
};

describe("GitHub applications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes configured GitHub providers", async () => {
    vi.mocked(dokployGet).mockResolvedValue([
      { githubId: "github-1", name: "Production GitHub" },
      { name: "Missing ID" },
    ]);

    await expect(getDokployGithubProviders()).resolves.toEqual([
      { githubId: "github-1", name: "Production GitHub" },
    ]);
  });

  it("creates and fully configures an application", async () => {
    vi.mocked(dokployPost).mockResolvedValueOnce({
      applicationId: "application-1",
    });

    await expect(createDokployGithubApplication(input)).resolves.toBe(
      "application-1",
    );
    expect(dokployPost).toHaveBeenNthCalledWith(1, "application.create", {
      name: "personal-site",
      appName: "personal-site",
      environmentId: "environment-1",
      sourceType: "github",
    });
    expect(dokployPost).toHaveBeenNthCalledWith(
      2,
      "application.saveGithubProvider",
      expect.objectContaining({
        applicationId: "application-1",
        buildPath: "/01-Apps/02-personal-site",
        watchPaths: ["01-Apps/02-personal-site/**"],
      }),
    );
    expect(dokployPost).toHaveBeenNthCalledWith(
      3,
      "application.saveBuildType",
      expect.objectContaining({
        applicationId: "application-1",
        buildType: "dockerfile",
      }),
    );
    expect(dokployPost).toHaveBeenNthCalledWith(4, "application.update", {
      applicationId: "application-1",
      autoDeploy: true,
      watchPaths: ["01-Apps/02-personal-site/**"],
    });
  });

  it("removes a partially configured application when setup fails", async () => {
    vi.mocked(dokployPost)
      .mockResolvedValueOnce({ data: { applicationId: "application-1" } })
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce(undefined);

    await expect(createDokployGithubApplication(input)).rejects.toThrow(
      "provider failed",
    );
    expect(dokployPost).toHaveBeenLastCalledWith("application.delete", {
      applicationId: "application-1",
    });
  });

  it("uses a public Git source when no GitHub provider is configured", async () => {
    vi.mocked(dokployPost).mockResolvedValueOnce({
      applicationId: "application-1",
    });

    await createDokployGithubApplication({ ...input, githubId: undefined });

    expect(dokployPost).toHaveBeenNthCalledWith(1, "application.create", {
      name: "personal-site",
      appName: "personal-site",
      environmentId: "environment-1",
      sourceType: "git",
    });
    expect(dokployPost).toHaveBeenNthCalledWith(
      2,
      "application.saveGitProvider",
      {
        applicationId: "application-1",
        customGitUrl: "https://github.com/owner/monorepo.git",
        customGitBranch: "main",
        customGitBuildPath: "/01-Apps/02-personal-site",
        watchPaths: ["01-Apps/02-personal-site/**"],
      },
    );
  });
});
