import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ dokployGet: vi.fn(), dokployPost: vi.fn() }));

import {
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
} from "./projects";

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
});
