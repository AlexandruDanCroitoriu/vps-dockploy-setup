import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ dokployGet: vi.fn(), dokployPost: vi.fn() }));

import { dokployGet, dokployPost } from "./client";
import {
  getDokployDomainServiceNames,
  hasDokployServiceContainer,
  reloadDokployService,
  removeDokployService,
  resolveDokployLiveStatus,
  shouldPollDokployServiceStatus,
  startDokployService,
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

beforeEach(() => {
  vi.mocked(dokployGet).mockReset();
  vi.mocked(dokployPost).mockReset();
});

describe("live service status", () => {
  it("detects a running compose container", async () => {
    await expect(
      resolveDokployLiveStatus({ ...service }, async () => ({
        containers: [{ State: "running" }],
      })),
    ).resolves.toMatchObject({ status: "running" });
  });

  it("reports running as soon as a deploying service has a live container", async () => {
    const loadContainers = vi.fn().mockResolvedValue({
      containers: [{ State: "running" }],
    });
    await expect(
      resolveDokployLiveStatus(
        { ...service, status: "deploying" },
        loadContainers,
      ),
    ).resolves.toMatchObject({ status: "running" });
    expect(loadContainers).toHaveBeenCalledWith(
      "docker.getContainersByAppNameMatch?appName=compose-app&appType=docker-compose",
    );
  });

  it("keeps deploying while no live container is available", async () => {
    await expect(
      resolveDokployLiveStatus(
        { ...service, status: "deploying" },
        async () => ({ containers: [{ State: "exited" }] }),
      ),
    ).resolves.toMatchObject({ status: "deploying" });
  });

  it("falls back to a compose container name when its project label is unavailable", async () => {
    const loadContainers = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ state: "running" }]);

    await expect(
      resolveDokployLiveStatus(
        { ...service, status: "deploying" },
        loadContainers,
      ),
    ).resolves.toMatchObject({ status: "running" });
    expect(loadContainers).toHaveBeenNthCalledWith(
      1,
      "docker.getContainersByAppNameMatch?appName=compose-app&appType=docker-compose",
    );
    expect(loadContainers).toHaveBeenNthCalledWith(
      2,
      "docker.getContainersByAppNameMatch?appName=compose-app",
    );
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

  it("does not demote a Dokploy-confirmed running service", async () => {
    const loadContainers = vi.fn().mockResolvedValue({ containers: [] });

    await expect(
      resolveDokployLiveStatus(
        { ...service, status: "running" },
        loadContainers,
      ),
    ).resolves.toMatchObject({ status: "running" });
    expect(loadContainers).not.toHaveBeenCalled();
  });
});

describe("service status polling", () => {
  const now = Date.parse("2026-08-23T20:00:00.000Z");

  it("polls deploying and recently created down services", () => {
    expect(
      shouldPollDokployServiceStatus({ ...service, status: "deploying" }, now),
    ).toBe(true);
    expect(
      shouldPollDokployServiceStatus(
        { ...service, status: "down", createdAt: "2026-08-23T19:59:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("does not poll established stopped services", () => {
    expect(
      shouldPollDokployServiceStatus(
        { ...service, status: "down", createdAt: "2026-08-23T19:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      shouldPollDokployServiceStatus({ ...service, status: "down" }, now),
    ).toBe(false);
  });
});

describe("service container history", () => {
  it("recognizes a stopped container as a previous deployment", async () => {
    vi.mocked(dokployGet).mockResolvedValueOnce({
      containers: [{ State: "exited" }],
    });

    await expect(hasDokployServiceContainer(service)).resolves.toBe(true);
  });

  it("does not query Docker when the service has no app name", async () => {
    await expect(
      hasDokployServiceContainer({ ...service, appName: null }),
    ).resolves.toBe(false);
    expect(dokployGet).not.toHaveBeenCalled();
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

  it("starts a stopped service with its service-specific identifier", async () => {
    await startDokployService("redis", "redis-1");

    expect(dokployPost).toHaveBeenCalledWith("redis.start", {
      redisId: "redis-1",
    });
  });

  it("removes an application with the application endpoint", async () => {
    await removeDokployService("applications", "application-1");

    expect(dokployPost).toHaveBeenCalledWith("application.delete", {
      applicationId: "application-1",
    });
  });

  it("removes Compose services and their volumes", async () => {
    await removeDokployService("compose", "compose-1");

    expect(dokployPost).toHaveBeenCalledWith("compose.delete", {
      composeId: "compose-1",
      deleteVolumes: true,
    });
  });

  it("removes databases with their database endpoint", async () => {
    await removeDokployService("postgres", "postgres-1");

    expect(dokployPost).toHaveBeenCalledWith("postgres.remove", {
      postgresId: "postgres-1",
    });
  });
});

describe("Compose domain services", () => {
  it("fetches service names from raw Compose before deployment", async () => {
    vi.mocked(dokployGet).mockResolvedValueOnce(["dbgate"]);

    await expect(getDokployDomainServiceNames(service)).resolves.toEqual([
      "dbgate",
    ]);
    expect(dokployGet).toHaveBeenCalledWith(
      "compose.loadServices?composeId=compose-1&type=fetch",
    );
  });
});
