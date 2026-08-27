import { describe, expect, it } from "vitest";

import {
  getRepositoryApplications,
  getRepositoryApplicationsResult,
  getRepositoryApplicationDefaultHost,
  isRepositoryApplicationDeployed,
  matchesRepositoryApplicationInput,
} from "./repository-applications";

describe("repository application discovery", () => {
  it("returns the bundled repository application manifest without GitHub access", async () => {
    await expect(getRepositoryApplications()).resolves.toEqual([
      {
        name: "01-infra-management",
        path: "01-Apps/01-infra-management",
        owner: "AlexandruDanCroitoriu",
        repository: "vps-dockploy-setup",
        branch: "main",
      },
    ]);
  });

  it("returns the manifest without an error", async () => {
    await expect(getRepositoryApplicationsResult()).resolves.toEqual({
      applications: [expect.objectContaining({ name: "01-infra-management" })],
      error: "",
    });
  });

  it("defaults Infra Management to the instance root domain", async () => {
    const [application] = await getRepositoryApplications();

    expect(
      getRepositoryApplicationDefaultHost(application, "infra.example.com"),
    ).toBe("infra.example.com");
  });

  it("detects a repository application anywhere on the instance", async () => {
    const [application] = await getRepositoryApplications();

    expect(
      isRepositoryApplicationDeployed(application, [
        { name: "unrelated", sourcePath: null },
        { name: "01-infra-management", sourcePath: null },
      ]),
    ).toBe(true);
    expect(
      isRepositoryApplicationDeployed(application, [
        { name: "renamed", sourcePath: "/01-Apps/01-infra-management/" },
      ]),
    ).toBe(true);
  });

  it("matches submitted repository coordinates with normalized paths", async () => {
    const [application] = await getRepositoryApplications();

    expect(
      matchesRepositoryApplicationInput(application, {
        owner: application.owner,
        repository: application.repository,
        buildPath: `/${application.path}/`,
      }),
    ).toBe(true);
  });
});
