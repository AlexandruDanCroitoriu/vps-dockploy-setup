import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ dokployPost: vi.fn() }));

import { dokployPost } from "./client";
import {
  createDokployDatabase,
  databaseProjectEnvironmentEntries,
  mergeDatabaseCredentialsIntoProjectEnv,
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

    const credentials = await createDokployDatabase({
      type: "postgres",
      environmentId: "environment-1",
      name: "postgres",
      databaseName: "app",
      databaseUser: "app-user",
      databasePassword: "app-password",
    });

    expect(credentials).toContainEqual({
      label: "Internal Host",
      value: "project-postgres-internal",
    });
    expect(credentials).toContainEqual({
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
});
