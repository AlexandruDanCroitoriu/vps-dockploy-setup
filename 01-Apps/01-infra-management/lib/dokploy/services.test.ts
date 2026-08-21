import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ dokployGet: vi.fn(), dokployPost: vi.fn() }));

import { dokployPost } from "./client";
import {
  reloadDokployService,
  resolveDokployLiveStatus,
  stopDokployService,
} from "./services";
import type { DokployService } from "./types";

const service: DokployService = {
  id: "compose-1",
  name: "Compose",
  appName: "compose-app",
  env: "",
  serverId: null,
  sourcePath: null,
  type: "compose",
  status: "down",
  credentials: [],
};

describe("live service status", () => {
  it("detects a running compose container", async () => {
    await expect(
      resolveDokployLiveStatus({ ...service }, async () => ({
        containers: [{ State: "running" }],
      })),
    ).resolves.toMatchObject({ status: "running" });
  });

  it("maps missing and malformed containers to down", async () => {
    await expect(
      resolveDokployLiveStatus({ ...service }, async () => ({
        malformed: true,
      })),
    ).resolves.toMatchObject({ status: "down" });
  });

  it("preserves the known status when Docker is unreachable", async () => {
    await expect(
      resolveDokployLiveStatus({ ...service, status: "running" }, async () => {
        throw new Error("Docker unavailable");
      }),
    ).resolves.toMatchObject({ status: "running" });
  });
});

describe("service lifecycle", () => {
  it("reloads an application by app name", async () => {
    await reloadDokployService("applications", "app-1", "web-app");

    expect(dokployPost).toHaveBeenCalledWith("application.reload", {
      applicationId: "app-1",
      appName: "web-app",
    });
  });

  it("uses redeploy as the compose reload operation", async () => {
    await reloadDokployService("compose", "compose-1", "compose-app");

    expect(dokployPost).toHaveBeenCalledWith("compose.redeploy", {
      composeId: "compose-1",
    });
  });

  it("stops a database with its service-specific identifier", async () => {
    await stopDokployService("postgres", "postgres-1");

    expect(dokployPost).toHaveBeenCalledWith("postgres.stop", {
      postgresId: "postgres-1",
    });
  });
});
