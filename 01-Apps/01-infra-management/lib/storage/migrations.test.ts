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

function versionFourDatabase() {
  const db = versionThreeDatabase();
  db.exec(`
    ALTER TABLE dokploy_instances
    ADD COLUMN default_service_username TEXT NOT NULL DEFAULT 'admin';
    ALTER TABLE dokploy_instances
    ADD COLUMN default_service_password TEXT NOT NULL DEFAULT 'admin';
    INSERT INTO schema_migrations VALUES (4, '2026-01-04T00:00:00.000Z');
  `);
  return db;
}

function versionFiveDatabase() {
  const db = versionFourDatabase();
  db.exec(`
    ALTER TABLE dokploy_instances
    ADD COLUMN vps_ip TEXT NOT NULL DEFAULT '';
    INSERT INTO schema_migrations VALUES (5, '2026-01-05T00:00:00.000Z');
  `);
  return db;
}

function versionSixDatabase() {
  const db = versionFiveDatabase();
  db.exec(`
    ALTER TABLE dokploy_instances
    ADD COLUMN vps_password TEXT NOT NULL DEFAULT '';
    INSERT INTO schema_migrations VALUES (6, '2026-01-06T00:00:00.000Z');
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
    ).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
    ]);
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
    ).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
    ]);
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
    ).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
    ]);
  });

  it("upgrades a version-four database with an empty VPS IP", () => {
    const db = versionFourDatabase();
    runMigrations(db);

    expect(
      db
        .prepare("SELECT vps_ip FROM dokploy_instances WHERE id = ?")
        .get("instance-1"),
    ).toEqual({ vps_ip: "" });
    expect(
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
    ]);
  });

  it("upgrades a version-five database with an empty VPS password", () => {
    const db = versionFiveDatabase();
    runMigrations(db);

    expect(
      db
        .prepare("SELECT vps_password FROM dokploy_instances WHERE id = ?")
        .get("instance-1"),
    ).toEqual({ vps_password: "" });
    expect(
      db
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
    ]);
  });

  it("upgrades version six with durable provisioning jobs", () => {
    const db = versionSixDatabase();
    runMigrations(db);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get("dokploy_provisioning_jobs"),
    ).toEqual({ name: "dokploy_provisioning_jobs" });
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("upgrades legacy provisioning step state from version seven", () => {
    const db = versionOneDatabase();
    runMigrations(db);
    db.prepare("DELETE FROM schema_migrations WHERE version = 8").run();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO dokploy_provisioning_jobs
      (id, name, root_url, root_domain, vps_ip, vps_password,
       default_service_username, default_service_password, status,
       steps_json, logs_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "job-1",
      "Production",
      "https://dockploy.example.com",
      "example.com",
      "203.0.113.10",
      "password",
      "admin@example.com",
      "password",
      "failed",
      JSON.stringify({
        connecting: "done",
        installing: "done",
        starting: "error",
        "api-key": "done",
        verifying: "error",
      }),
      JSON.stringify({}),
      now,
      now,
    );

    runMigrations(db);
    const row = db
      .prepare("SELECT steps_json FROM dokploy_provisioning_jobs WHERE id = ?")
      .get("job-1") as { steps_json: string };
    expect(JSON.parse(row.steps_json)).toEqual({ installing: "error" });
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("is idempotent after all migrations are applied", () => {
    const db = versionOneDatabase();
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(
      db.prepare("SELECT COUNT(*) count FROM schema_migrations").get(),
    ).toEqual({ count: 11 });
  });

  it("upgrades version nine by removing obsolete R2 credential storage", () => {
    const db = versionOneDatabase();
    runMigrations(db);
    db.exec(`
      DELETE FROM schema_migrations WHERE version = 10;
      CREATE TABLE r2_credentials (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_key_id TEXT NOT NULL,
        secret_access_key TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    runMigrations(db);

    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get("r2_credentials"),
    ).toBeUndefined();
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("upgrades version ten with PostgreSQL restore markers", () => {
    const db = versionOneDatabase();
    runMigrations(db);
    db.exec(
      "DROP TABLE postgres_restore_state; DELETE FROM schema_migrations WHERE version = 11;",
    );

    runMigrations(db);

    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get("postgres_restore_state"),
    ).toEqual({ name: "postgres_restore_state" });
    expect(() => runMigrations(db)).not.toThrow();
  });
});
