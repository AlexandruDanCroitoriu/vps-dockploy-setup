import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrations";

let database: Database.Database | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

function versionOneDatabase() {
  database = new Database(":memory:");
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations VALUES (1, '2026-01-01T00:00:00.000Z');
    CREATE TABLE dokploy_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_url TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO dokploy_instances VALUES (
      'instance-1', 'Production', 'https://dockploy.example.com', 'key',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
  `);
  return database;
}

function versionTwoDatabase() {
  const db = versionOneDatabase();
  db.exec(`
    ALTER TABLE dokploy_instances
    ADD COLUMN root_domain TEXT NOT NULL DEFAULT '';
    UPDATE dokploy_instances
    SET root_domain = 'dockploy.example.com'
    WHERE id = 'instance-1';
    INSERT INTO schema_migrations VALUES (2, '2026-01-02T00:00:00.000Z');
  `);
  return db;
}

function versionThreeDatabase() {
  const db = versionTwoDatabase();
  db.exec(`
    UPDATE dokploy_instances
    SET root_domain = substr(root_domain, 10)
    WHERE root_domain LIKE 'dockploy.%';
    INSERT INTO schema_migrations VALUES (3, '2026-01-03T00:00:00.000Z');
  `);
  return db;
}

describe("SQLite migrations", () => {
  it("upgrades a version-one database and backfills instance defaults", () => {
    const db = versionOneDatabase();
    runMigrations(db);

    expect(
      db
        .prepare(
          `SELECT root_domain, default_service_username,
                  default_service_password
           FROM dokploy_instances WHERE id = ?`,
        )
        .get("instance-1"),
    ).toEqual({
      root_domain: "example.com",
      default_service_username: "admin",
      default_service_password: "admin",
    });
    expect(
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
  });

  it("upgrades a version-two database and normalizes its root domain", () => {
    const db = versionTwoDatabase();
    runMigrations(db);

    expect(
      db
        .prepare("SELECT root_domain FROM dokploy_instances WHERE id = ?")
        .get("instance-1"),
    ).toEqual({ root_domain: "example.com" });
    expect(
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
  });

  it("upgrades a version-three database with service credential defaults", () => {
    const db = versionThreeDatabase();
    runMigrations(db);

    expect(
      db
        .prepare(
          `SELECT default_service_username, default_service_password
           FROM dokploy_instances WHERE id = ?`,
        )
        .get("instance-1"),
    ).toEqual({
      default_service_username: "admin",
      default_service_password: "admin",
    });
    expect(
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
  });

  it("is idempotent after all migrations are applied", () => {
    const db = versionOneDatabase();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(
      db.prepare("SELECT COUNT(*) count FROM schema_migrations").get(),
    ).toEqual({ count: 4 });
  });
});
