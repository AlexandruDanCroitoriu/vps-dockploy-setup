import { describe, expect, it } from "vitest";

import {
  getRepositoryApplications,
  getRepositoryApplicationsResult,
  isRepositoryApplicationDeployed,
  matchesRepositoryApplicationInput,
} from "./repository-applications";

describe("repository application discovery", () => {
  it("returns the bundled repository application manifest without GitHub access", async () => {
    await expect(getRepositoryApplications()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "01-infra-management" }),
        expect.objectContaining({
          name: "vendure-backend",
          kind: "vendure-backend",
        }),
        expect.objectContaining({
          name: "vendure-storefront",
          kind: "vendure-storefront",
          repeatable: true,
        }),
        expect.objectContaining({
          name: "vendure-storefront-clean",
          path: "01-Apps/02-Online-Store-Vendure/apps/storefront-clean",
          kind: "vendure-storefront",
          repeatable: true,
        }),
      ]),
    );
  });

  it("returns the manifest without an error", async () => {
    const result = await getRepositoryApplicationsResult();
    expect(result.error).toBe("");
    expect(result.applications).toHaveLength(4);
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

  it("allows repeatable Vendure storefront deployments", async () => {
    const applications = await getRepositoryApplications();
    const storefront = applications.find(
      (application) => application.name === "vendure-storefront",
    )!;

    expect(
      isRepositoryApplicationDeployed(storefront, [
        { name: "shop-one", sourcePath: `/${storefront.path}` },
      ]),
    ).toBe(false);
  });

  it("recognizes the fixed Docker-backed Vendure application name", async () => {
    const applications = await getRepositoryApplications();
    const backend = applications.find(
      (application) => application.kind === "vendure-backend",
    )!;

    expect(
      isRepositoryApplicationDeployed(backend, [
        { name: "vendure", sourcePath: null },
      ]),
    ).toBe(true);
  });
});
