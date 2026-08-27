import { describe, expect, it } from "vitest";

import {
  containersFromResponse,
  isContainerRunning,
  normalizeProject,
  normalizeServiceStatus,
} from "./normalizers";
import { isValidHostname, isValidPort } from "./validators";

describe("Dokploy input validators", () => {
  it.each(["app.example.com", "api-1.example.co.uk"])(
    "accepts hostname %s",
    (host) => {
      expect(isValidHostname(host)).toBe(true);
    },
  );
  it.each([
    "https://example.com",
    "localhost",
    "bad_name.example.com",
    "example.com/path",
  ])("rejects hostname %s", (host) => {
    expect(isValidHostname(host)).toBe(false);
  });
  expect(isValidPort(1)).toBe(true);
  expect(isValidPort(65535)).toBe(true);
  expect(isValidPort(0)).toBe(false);
  expect(isValidPort(65536)).toBe(false);
});

describe("normalizeServiceStatus", () => {
  it.each([
    ["done", "running"],
    ["running-healthy", "running"],
    ["running", "deploying"],
    ["deploying", "deploying"],
    ["idle", "down"],
    [undefined, "down"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeServiceStatus(input)).toBe(expected);
  });
});

describe("container status", () => {
  it.each([
    [{ State: "running" }, true],
    [{ Status: "running" }, true],
    [{ status: "running" }, true],
    [{ Status: "Up 2 minutes" }, true],
    [{ status: "up" }, true],
    [{ currentState: "Running 2 minutes ago" }, true],
    [{ state: "running", currentState: "Rejected 2 minutes ago" }, false],
    [{ State: "exited", Status: "Exited (1)" }, false],
    [{ broken: true }, false],
  ])("detects running containers", (container, expected) => {
    expect(isContainerRunning(container)).toBe(expected);
  });

  it("unwraps direct and nested container responses", () => {
    expect(containersFromResponse([{ State: "running" }])).toHaveLength(1);
    expect(
      containersFromResponse({ data: [{ State: "running" }] }),
    ).toHaveLength(1);
    expect(containersFromResponse({ malformed: true })).toEqual([]);
  });
});

describe("normalizeProject", () => {
  it("normalizes applications, compose services, and every database type", () => {
    const project = normalizeProject({
      projectId: "project-1",
      name: "Infra",
      environments: [
        {
          environmentId: "environment-1",
          name: "Production",
          applications: [
            {
              applicationId: "app-1",
              name: "Web",
              applicationStatus: "done",
              customGitBuildPath: "/01-Apps/01-web",
            },
          ],
          compose: [
            {
              composeId: "compose-1",
              name: "Workers",
              composeStatus: "deploying",
            },
          ],
          postgres: [
            {
              postgresId: "pg-1",
              appName: "postgres-internal",
              databaseUser: "user",
              databasePassword: "secret",
              databaseName: "app",
            },
          ],
          mysql: [{ mysqlId: "mysql-1" }],
          mariadb: [{ mariadbId: "maria-1" }],
          mongo: [{ mongoId: "mongo-1" }],
          redis: [{ redisId: "redis-1", databasePassword: "secret" }],
        },
      ],
    });

    expect(project?.environments[0].services.map(({ type }) => type)).toEqual([
      "applications",
      "compose",
      "postgres",
      "mysql",
      "mariadb",
      "mongo",
      "redis",
    ]);
    expect(project?.environments[0].services[0].status).toBe("running");
    expect(project?.environments[0].services[0].sourcePath).toBe(
      "/01-Apps/01-web",
    );
    expect(project?.environments[0].services[1].status).toBe("deploying");
    expect(project?.environments[0].services[2].credentials).toContainEqual({
      label: "Internal Port",
      value: "5432",
    });
  });

  it("rejects malformed projects and skips malformed services", () => {
    expect(normalizeProject(null)).toBeNull();
    expect(normalizeProject({ name: "Missing ID" })).toBeNull();
    expect(
      normalizeProject({
        projectId: "ok",
        environments: [{ environmentId: "env", applications: [{}] }],
      })?.environments[0].services,
    ).toEqual([]);
  });
});
