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
    await mkdir(path.join(appsDirectory, "01-web"));
    await mkdir(path.join(appsDirectory, ".ignored"));
    await writeFile(path.join(appsDirectory, "01-web", "Dockerfile"), "");

    await expect(getRepositoryProjects(appsDirectory)).resolves.toEqual([
      {
        name: "01-web",
        path: "01-Apps/01-web",
        imageRepository: "web",
        hasDockerfile: true,
      },
      {
        name: "02-api",
        path: "01-Apps/02-api",
        imageRepository: "api",
        hasDockerfile: false,
      },
    ]);
  });
});
