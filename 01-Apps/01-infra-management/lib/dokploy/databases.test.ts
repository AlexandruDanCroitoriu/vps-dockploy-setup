import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ dokployPost: vi.fn() }));

import { dokployPost } from "./client";
import {
  createDokployDatabase,
  databaseProjectEnvironmentEntries,
  mergeDatabaseCredentialsIntoProjectEnv,
  removeDatabaseCredentialsFromProjectEnv,
} from "./databases";

beforeEach(() => {
  vi.mocked(dokployPost).mockReset();
});

describe("database project credentials", () => {
  it("returns internal credentials from a created PostgreSQL database", async () => {
    vi.mocked(dokployPost).mockResolvedValueOnce({
      postgresId: "postgres-1",
      appName: "project-postgres-internal",
    });

    const result = await createDokployDatabase({
      type: "postgres",
      environmentId: "environment-1",
      name: "postgres",
      databaseName: "app",
      databaseUser: "app-user",
      databasePassword: "app-password",
    });

    expect(result.databaseId).toBe("postgres-1");
    expect(result.credentials).toContainEqual({
      label: "Internal Host",
      value: "project-postgres-internal",
    });
    expect(result.credentials).toContainEqual({
      label: "Internal Connection URL",
      value:
        "postgresql://app-user:app-password@project-postgres-internal:5432/app",
      secret: true,
    });
  });

  it("creates service-scoped environment variable names", () => {
    expect(
      databaseProjectEnvironmentEntries("redis", "cache redis", [
        { label: "Internal Host", value: "redis-internal" },
        { label: "Internal Port", value: "6379" },
        { label: "Password", value: "secret" },
      ]),
    ).toEqual({
      REDIS_HOST: "redis-internal",
      REDIS_PORT: "6379",
      REDIS_PASSWORD: "secret",
      CACHE_REDIS_HOST: "redis-internal",
      CACHE_REDIS_PORT: "6379",
      CACHE_REDIS_PASSWORD: "secret",
    });
  });

  it("merges existing database credentials into project variables", () => {
    expect(
      mergeDatabaseCredentialsIntoProjectEnv("APP_ENV=production", [
        {
          id: "redis-1",
          name: "redis",
          appName: "redis-internal",
          env: "",
          serverId: null,
          sourcePath: null,
          type: "redis",
          status: "running",
          credentials: [
            { label: "Internal Host", value: "redis-internal" },
            { label: "Internal Port", value: "6379" },
          ],
        },
      ]),
    ).toContain('REDIS_HOST="redis-internal"');
  });

  it("removes deleted database variables and preserves unrelated variables", () => {
    const removed = {
      id: "postgres-1",
      name: "primary database",
      appName: "postgres-internal",
      env: "",
      serverId: null,
      sourcePath: null,
      type: "postgres" as const,
      status: "running" as const,
      credentials: [
        { label: "Internal Host", value: "postgres-internal" },
        { label: "Password", value: "secret" },
      ],
    };
    expect(
      removeDatabaseCredentialsFromProjectEnv(
        'APP_ENV="production"\nPOSTGRES_HOST="postgres-internal"\nPOSTGRES_PASSWORD="secret"\nPRIMARY_DATABASE_HOST="postgres-internal"',
        removed,
        [],
      ),
    ).toBe('APP_ENV="production"');
  });
});
