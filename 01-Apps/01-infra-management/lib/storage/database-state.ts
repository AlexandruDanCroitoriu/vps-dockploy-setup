import "server-only";

import type Database from "better-sqlite3";

import { getDatabase } from "./database";

const SNAPSHOT_FORMAT = "infra-management-database-state";
const SNAPSHOT_VERSION = 1;
const STATE_TABLES = [
  "dokploy_instances",
  "dokploy_provisioning_jobs",
] as const;

type StateTable = (typeof STATE_TABLES)[number];
type StateRow = Record<string, string | number | null>;

export type DatabaseStateSnapshot = {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<StateTable, StateRow[]>;
};

function schemaVersion(database: Database.Database) {
  return (
    (
      database
        .prepare("SELECT MAX(version) AS version FROM schema_migrations")
        .get() as { version: number | null }
    ).version ?? 0
  );
}

function tableColumns(database: Database.Database, table: StateTable) {
  return (
    database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>
  ).map((column) => column.name);
}

export function exportDatabaseState(
  database: Database.Database = getDatabase(),
): DatabaseStateSnapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    schemaVersion: schemaVersion(database),
    exportedAt: new Date().toISOString(),
    tables: {
      dokploy_instances: database
        .prepare("SELECT * FROM dokploy_instances ORDER BY created_at, id")
        .all() as StateRow[],
      dokploy_provisioning_jobs: database
        .prepare(
          "SELECT * FROM dokploy_provisioning_jobs ORDER BY created_at, id",
        )
        .all() as StateRow[],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRows(
  database: Database.Database,
  table: StateTable,
  value: unknown,
) {
  if (!Array.isArray(value)) throw new Error(`Invalid ${table} rows.`);
  const columns = tableColumns(database, table);
  const expected = new Set(columns);
  return value.map((candidate): StateRow => {
    if (!isRecord(candidate)) throw new Error(`Invalid ${table} row.`);
    const keys = Object.keys(candidate);
    if (
      keys.length !== columns.length ||
      keys.some((key) => !expected.has(key))
    ) {
      throw new Error(`The ${table} columns do not match this database.`);
    }
    const row: StateRow = {};
    for (const column of columns) {
      const cell = candidate[column];
      if (
        cell !== null &&
        typeof cell !== "string" &&
        typeof cell !== "number"
      ) {
        throw new Error(`Invalid ${table}.${column} value.`);
      }
      row[column] = cell;
    }
    return row;
  });
}

export function importDatabaseState(
  value: unknown,
  database: Database.Database = getDatabase(),
) {
  if (!isRecord(value) || value.format !== SNAPSHOT_FORMAT) {
    throw new Error("This is not an Infra Management database export.");
  }
  if (value.version !== SNAPSHOT_VERSION) {
    throw new Error("Unsupported database export version.");
  }
  if (value.schemaVersion !== schemaVersion(database)) {
    throw new Error("The database export uses an incompatible schema.");
  }
  const tables = value.tables;
  if (!isRecord(tables)) throw new Error("Database tables are missing.");
  const tableKeys = Object.keys(tables);
  if (
    tableKeys.length !== STATE_TABLES.length ||
    tableKeys.some((table) => !STATE_TABLES.includes(table as StateTable))
  ) {
    throw new Error("The database export contains unexpected tables.");
  }

  const rows = Object.fromEntries(
    STATE_TABLES.map((table) => [
      table,
      validateRows(database, table, tables[table]),
    ]),
  ) as Record<StateTable, StateRow[]>;

  database.transaction(() => {
    database.prepare("DELETE FROM dokploy_provisioning_jobs").run();
    database.prepare("DELETE FROM dokploy_instances").run();
    for (const table of STATE_TABLES) {
      const columns = tableColumns(database, table);
      const placeholders = columns.map(() => "?").join(", ");
      const insert = database.prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
      );
      for (const row of rows[table]) {
        insert.run(...columns.map((column) => row[column]));
      }
    }
  })();

  return {
    instances: rows.dokploy_instances.length,
    provisioningJobs: rows.dokploy_provisioning_jobs.length,
  };
}
