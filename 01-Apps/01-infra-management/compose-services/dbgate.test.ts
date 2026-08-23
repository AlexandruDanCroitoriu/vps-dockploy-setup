import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { DokployService } from "@/lib/dokploy";

import {
  buildDbGateEnvironment,
  buildDbGateServiceReferences,
  dbGateService,
} from "./dbgate";

function database(
  type: "postgres" | "redis",
  values: Record<string, string>,
): DokployService {
  return {
    id: `${type}-1`,
    name: type === "postgres" ? "Primary PostgreSQL" : "Cache Redis",
    appName: `${type}-internal`,
    env: "",
    serverId: null,
    sourcePath: null,
    type,
    status: "running",
    credentials: Object.entries(values).map(([label, value]) => ({
      label,
      value,
    })),
  };
}

describe("DBGate Compose definition", () => {
  it("uses the official image, persistent data, and Dokploy network", () => {
    expect(dbGateService.composeFile).toContain("dbgate/dbgate:latest");
    expect(dbGateService.composeFile).toContain("dbgate-data:/root/.dbgate");
    expect(dbGateService.composeFile).toContain("dokploy-network");
    expect(dbGateService.composeFile).toContain('expose:\n      - "3000"');
    expect(dbGateService.domain).toMatchObject({
      serviceName: "dbgate",
      defaultSubdomain: "dbgate",
      port: 3000,
    });
    expect(dbGateService.environmentTarget).toBe("project");
    expect(dbGateService.requiresLoginCredentials).toBe(true);
    expect(dbGateService.domain).toMatchObject({
      httpsByDefault: true,
      required: true,
    });
  });

  it("selects available connections without copying database credentials", () => {
    const environment = buildDbGateEnvironment(
      [
        database("postgres", {
          "Internal Host": "postgres-host",
          "Internal Port": "5432",
          User: "postgres-user",
          Password: "postgres-password",
          "Database Name": "app-db",
        }),
        database("redis", {
          "Internal Host": "redis-host",
          "Internal Port": "6379",
          Password: "redis-password",
        }),
      ],
      "dbgate-login-password",
      "dbgate-admin",
    );

    expect(environment).toContain('DBGATE_CONNECTIONS="postgres,redis"');
    expect(environment).not.toContain("POSTGRES_HOST");
    expect(environment).not.toContain("POSTGRES_PASSWORD");
    expect(environment).not.toContain("REDIS_HOST");
    expect(environment).not.toContain("REDIS_PASSWORD");
    expect(environment).toContain('DBGATE_PASSWORD="dbgate-login-password"');
    expect(environment).toContain('DBGATE_LOGIN="dbgate-admin"');
  });

  it("omits unavailable database connections", () => {
    const environment = buildDbGateEnvironment([], "login-password");

    expect(environment).toContain('DBGATE_CONNECTIONS=""');
    expect(environment).not.toContain("POSTGRES_HOST");
    expect(environment).not.toContain("REDIS_HOST");
  });

  it("references project credentials from the Compose service environment", () => {
    const references = buildDbGateServiceReferences([
      database("postgres", {}),
      database("redis", {}),
    ]);

    expect(references).toContain("POSTGRES_HOST=${{project.POSTGRES_HOST}}");
    expect(references).toContain(
      "POSTGRES_PASSWORD=${{project.POSTGRES_PASSWORD}}",
    );
    expect(references).toContain("REDIS_HOST=${{project.REDIS_HOST}}");
    expect(references).toContain("REDIS_PASSWORD=${{project.REDIS_PASSWORD}}");
    expect(references).toContain(
      "DBGATE_CONNECTIONS=${{project.DBGATE_CONNECTIONS}}",
    );
  });
});
