import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getProjectImageRepository,
  getRepositoryProjects,
} from "./repository-projects";

describe("local repository project discovery", () => {
  it("normalizes numbered application folders as Docker repositories", () => {
    expect(getProjectImageRepository("01-infra-management")).toBe(
      "infra-management",
    );
    expect(getProjectImageRepository("02_My App")).toBe("02_my-app");
  });

  it("discovers immediate application folders and Dockerfiles", async () => {
    const appsDirectory = await mkdtemp(
      path.join(tmpdir(), "infra-management-projects-"),
    );
    await mkdir(path.join(appsDirectory, "02-api"));
    await mkdir(path.join(appsDirectory, "02-api", "apps"));
    await mkdir(path.join(appsDirectory, "02-api", "apps", "server"));
    await mkdir(path.join(appsDirectory, "01-web"));
    await mkdir(path.join(appsDirectory, ".ignored"));
    await writeFile(path.join(appsDirectory, "01-web", "Dockerfile"), "");
    await writeFile(
      path.join(appsDirectory, "02-api", "apps", "server", "Dockerfile"),
      "",
    );

    await expect(getRepositoryProjects(appsDirectory)).resolves.toEqual([
      {
        name: "01-web",
        path: "01-Apps/01-web",
        imageRepository: "web",
        hasDockerfile: true,
        nestedDockerfiles: [],
        imageTargets: [
          {
            id: "default",
            name: "01-web",
            contextPath: ".",
            dockerfilePath: "Dockerfile",
            imageRepository: "web",
            available: true,
          },
        ],
      },
      {
        name: "02-api",
        path: "01-Apps/02-api",
        imageRepository: "api",
        hasDockerfile: false,
        nestedDockerfiles: ["apps/server/Dockerfile"],
        imageTargets: [
          {
            id: "server",
            name: "server",
            contextPath: "apps/server",
            dockerfilePath: "Dockerfile",
            imageRepository: "api-server",
            available: true,
          },
        ],
      },
    ]);
  });

  it("uses one Vendure backend target for the server and worker", async () => {
    const appsDirectory = await mkdtemp(
      path.join(tmpdir(), "infra-management-vendure-"),
    );
    const project = path.join(appsDirectory, "02-Online-Store-Vendure");
    for (const app of ["server", "storefront", "storefront-clean"]) {
      await mkdir(path.join(project, "apps", app), { recursive: true });
      await writeFile(path.join(project, "apps", app, "Dockerfile"), "");
    }

    const [vendure] = await getRepositoryProjects(appsDirectory);
    expect(vendure.imageTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "server",
          imageRepository: "online-store-vendure-server",
        }),
        expect.objectContaining({
          id: "storefront",
          imageRepository: "online-store-vendure-storefront",
        }),
        expect.objectContaining({
          id: "storefront-clean",
          imageRepository: "online-store-vendure-storefront-clean",
        }),
      ]),
    );
    expect(vendure.imageTargets).toHaveLength(3);
    expect(vendure.imageTargets).not.toContainEqual(
      expect.objectContaining({ id: "worker" }),
    );
  });
});
