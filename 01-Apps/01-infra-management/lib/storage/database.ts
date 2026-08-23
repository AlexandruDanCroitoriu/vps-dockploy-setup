import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations";

let database: Database.Database | null = null;
let databasePath = "";

function resolveDatabasePath() {
  const defaultPath =
    process.env.NODE_ENV === "production"
      ? "/app/data/infra-management.sqlite"
      : path.join(process.cwd(), "data", "infra-management.sqlite");
  return path.resolve(process.env.SQLITE_DATABASE_PATH || defaultPath);
}

export function getDatabase() {
  const resolvedPath = resolveDatabasePath();
  if (database && databasePath === resolvedPath) return database;

  database?.close();
  const directory = path.dirname(resolvedPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  database = new Database(resolvedPath);
  fs.chmodSync(resolvedPath, 0o600);
  databasePath = resolvedPath;
  database.pragma("journal_mode = WAL");
  for (const suffix of ["-wal", "-shm"]) {
    const sidecarPath = `${resolvedPath}${suffix}`;
    if (fs.existsSync(sidecarPath)) fs.chmodSync(sidecarPath, 0o600);
  }
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  runMigrations(database);
  return database;
}

export function closeDatabaseForTests() {
  database?.close();
  database = null;
  databasePath = "";
}
