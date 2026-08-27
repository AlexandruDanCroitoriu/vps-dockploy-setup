import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({
  dokployGet: vi.fn(),
  dokployGetFresh: vi.fn(),
  dokployPost: vi.fn(),
}));

import {
  getDokployProjects,
  getFreshDokployProject,
  getFreshDokployProjects,
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
  removeDokployProjectEnvEntries,
} from "./projects";
import { dokployGet, dokployGetFresh } from "./client";

beforeEach(() => {
  vi.mocked(dokployGet).mockReset();
  vi.mocked(dokployGetFresh).mockReset();
});

describe("project loading", () => {
  it("hydrates sparse project-list databases with project details", async () => {
    vi.mocked(dokployGet)
      .mockResolvedValueOnce([
        {
          projectId: "project-1",
          name: "Project",
          environments: [
            {
              environmentId: "env-1",
              name: "Production",
              postgres: [{ postgresId: "pg-1" }],
            },
          ],
        },
      ])
      .mockResolvedValueOnce({
        projectId: "project-1",
        name: "Project",
        environments: [
          {
            environmentId: "env-1",
            name: "Production",
            postgres: [
              {
                postgresId: "pg-1",
                name: "postgres",
                appName: "postgres-generated-name",
                applicationStatus: "done",
                createdAt: "2026-08-23T20:00:00.000Z",
              },
            ],
          },
        ],
      });

    const projects = await getDokployProjects();

    expect(projects[0].environments[0].services[0]).toMatchObject({
      id: "pg-1",
      appName: "postgres-generated-name",
      status: "running",
      createdAt: "2026-08-23T20:00:00.000Z",
    });
    expect(dokployGet).toHaveBeenNthCalledWith(
      2,
      "project.one?projectId=project-1",
    );
  });

  it("bypasses the cached transport for a forced project refresh", async () => {
    vi.mocked(dokployGetFresh).mockResolvedValueOnce([]);

    await expect(getFreshDokployProjects()).resolves.toEqual([]);

    expect(dokployGetFresh).toHaveBeenCalledWith("project.all");
    expect(dokployGet).not.toHaveBeenCalled();
  });

  it("bypasses the cached transport when refreshing one project", async () => {
    vi.mocked(dokployGetFresh).mockResolvedValueOnce({
      projectId: "project-1",
      name: "Main",
      environments: [
        {
          environmentId: "env-1",
          name: "Production",
          compose: [{ composeId: "zot-1", name: "Zot" }],
        },
      ],
    });

    const project = await getFreshDokployProject("project-1");

    expect(project?.environments[0].services[0]).toMatchObject({
      id: "zot-1",
      name: "Zot",
      type: "compose",
    });
    expect(dokployGetFresh).toHaveBeenCalledWith(
      "project.one?projectId=project-1",
    );
    expect(dokployGet).not.toHaveBeenCalled();
  });
});

describe("project environment variables", () => {
  it("updates database keys while preserving unrelated lines", () => {
    expect(
      mergeDokployProjectEnv(
        '# Existing settings\nAPP_ENV="production"\nPOSTGRES_HOST="old"',
        {
          POSTGRES_HOST: "postgres-internal",
          POSTGRES_PASSWORD: "secret#value",
        },
      ),
    ).toBe(
      '# Existing settings\nAPP_ENV="production"\nPOSTGRES_HOST="postgres-internal"\n\nPOSTGRES_PASSWORD="secret#value"',
    );
  });

  it("removes duplicate managed keys", () => {
    expect(
      mergeDokployProjectEnv('REDIS_HOST="one"\nREDIS_HOST="two"', {
        REDIS_HOST: "redis-internal",
      }),
    ).toBe('REDIS_HOST="redis-internal"');
  });

  it("reads quoted project variables", () => {
    expect(
      parseDokployEnvironmentEntries(
        '# DBGate\nDBGATE_LOGIN="admin"\nDBGATE_PASSWORD="secret#value"',
      ),
    ).toEqual({
      DBGATE_LOGIN: "admin",
      DBGATE_PASSWORD: "secret#value",
    });
  });

  it("removes managed variables while preserving unrelated entries", () => {
    expect(
      removeDokployProjectEnvEntries(
        '# App\nAPP_ENV="production"\nPOSTGRES_HOST="host"\nPOSTGRES_PASSWORD="secret"',
        new Set(["POSTGRES_HOST", "POSTGRES_PASSWORD"]),
      ),
    ).toBe('# App\nAPP_ENV="production"');
  });
});
