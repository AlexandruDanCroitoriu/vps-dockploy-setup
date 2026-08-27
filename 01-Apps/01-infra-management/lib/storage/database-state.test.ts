import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runMigrations } from "./migrations";
import { exportDatabaseState, importDatabaseState } from "./database-state";

let database: Database.Database;

beforeEach(() => {
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  runMigrations(database);
  database
    .prepare(
      `INSERT INTO dokploy_instances
       (id, name, root_url, api_key, created_at, updated_at, root_domain,
        default_service_username, default_service_password, vps_ip, vps_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "instance-1",
      "Production",
      "https://dokploy.example.com",
      "secret-api-key",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "example.com",
      "admin@example.com",
      "secret-password",
      "192.0.2.1",
      "root-password",
    );
});

afterEach(() => database.close());

describe("database state snapshots", () => {
  it("round-trips all operational database state", () => {
    const snapshot = exportDatabaseState(database);
    database.prepare("DELETE FROM dokploy_instances").run();

    expect(importDatabaseState(snapshot, database)).toEqual({
      instances: 1,
      provisioningJobs: 0,
    });
    expect(
      database
        .prepare("SELECT api_key FROM dokploy_instances WHERE id = ?")
        .pluck()
        .get("instance-1"),
    ).toBe("secret-api-key");
  });

  it("rejects incompatible snapshots without changing current data", () => {
    const snapshot = exportDatabaseState(database);
    snapshot.schemaVersion += 1;

    expect(() => importDatabaseState(snapshot, database)).toThrow(
      "incompatible schema",
    );
    expect(
      database.prepare("SELECT COUNT(*) FROM dokploy_instances").pluck().get(),
    ).toBe(1);
  });
});
