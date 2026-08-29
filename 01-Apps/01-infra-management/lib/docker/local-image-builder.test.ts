import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  collapseLocalDockerImages,
  createInfraManagementDatabaseSeed,
  createBuildVersionTag,
  isDockerDaemonUnavailableError,
  isValidDockerTag,
} from "./local-image-builder";

describe("local Docker image validation", () => {
  it("accepts standard image tags and rejects unsafe values", () => {
    expect(isValidDockerTag("v1.2.3-rc1")).toBe(true);
    expect(isValidDockerTag("latest")).toBe(true);
    expect(isValidDockerTag("bad tag")).toBe(false);
    expect(isValidDockerTag("--output=/tmp/result")).toBe(false);
  });

  it("keeps latest first and collapses immutable tags for the same build", () => {
    expect(
      collapseLocalDockerImages([
        {
          name: "infra-management",
          tag: "build-20260823T100000000Z",
          imageId: "sha256:old",
          createdAt: "2026-08-23T10:00:00Z",
          current: false,
          digests: [],
        },
        {
          name: "infra-management",
          tag: "build-20260824T100000000Z",
          imageId: "sha256:new",
          createdAt: "2026-08-24T10:00:00Z",
          current: false,
          digests: [],
        },
        {
          name: "infra-management",
          tag: "latest",
          imageId: "sha256:new",
          createdAt: "2026-08-24T10:00:00Z",
          current: false,
          digests: [],
        },
      ]),
    ).toEqual([
      expect.objectContaining({ tag: "latest", current: true }),
      expect.objectContaining({
        tag: "build-20260823T100000000Z",
        current: false,
      }),
    ]);
  });

  it("creates a Docker-safe immutable build tag", () => {
    expect(createBuildVersionTag(new Date("2026-08-24T10:00:00.123Z"))).toBe(
      "build-20260824T100000123Z",
    );
  });

  it("recognizes Docker daemon connection failures", () => {
    expect(
      isDockerDaemonUnavailableError(
        new Error(
          "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
        ),
      ),
    ).toBe(true);
    expect(
      isDockerDaemonUnavailableError(
        new Error(
          "error during connect: open //./pipe/docker_engine: The system cannot find the file specified.",
        ),
      ),
    ).toBe(true);
    expect(isDockerDaemonUnavailableError(new Error("permission denied"))).toBe(
      false,
    );
    expect(
      isDockerDaemonUnavailableError(
        new Error(
          "The command 'docker' could not be found in this WSL 2 distro. Activate the WSL integration in Docker Desktop.",
        ),
      ),
    ).toBe(true);
  });

  it("creates a consistent Infra Management database seed", async () => {
    const projectDirectory = await mkdtemp(
      path.join(tmpdir(), "infra-image-seed-"),
    );
    try {
      const dataDirectory = path.join(projectDirectory, "data");
      await mkdir(dataDirectory);
      const source = new Database(
        path.join(dataDirectory, "infra-management.sqlite"),
      );
      source.exec(
        "CREATE TABLE settings (value TEXT); INSERT INTO settings VALUES ('copied')",
      );
      source.close();

      const seedPath =
        await createInfraManagementDatabaseSeed(projectDirectory);
      expect(seedPath).not.toBeNull();
      const seed = new Database(seedPath!, { readonly: true });
      expect(seed.prepare("SELECT value FROM settings").pluck().get()).toBe(
        "copied",
      );
      seed.close();
    } finally {
      await rm(projectDirectory, { recursive: true, force: true });
    }
  });
});
