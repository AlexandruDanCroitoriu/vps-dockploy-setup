import type Database from "better-sqlite3";

const migrations = [
  `
    CREATE TABLE dokploy_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_url TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  `
    ALTER TABLE dokploy_instances
    ADD COLUMN root_domain TEXT NOT NULL DEFAULT '';
  `,
  `
    UPDATE dokploy_instances
    SET root_domain = substr(root_domain, 10)
    WHERE root_domain LIKE 'dockploy.%';
  `,
  `
    ALTER TABLE dokploy_instances
    ADD COLUMN default_service_username TEXT NOT NULL DEFAULT 'admin';

    ALTER TABLE dokploy_instances
    ADD COLUMN default_service_password TEXT NOT NULL DEFAULT 'admin';
  `,
] as const;

export function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    database
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => (row as { version: number }).version),
  );
  const applyMigration = database.transaction(
    (version: number, sql: string) => {
      database.exec(sql);
      database
        .prepare(
          "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        )
        .run(version, new Date().toISOString());
    },
  );

  migrations.forEach((sql, index) => {
    const version = index + 1;
    if (!applied.has(version)) applyMigration(version, sql);
  });

  const rows = database
    .prepare(
      "SELECT id, root_url FROM dokploy_instances WHERE root_domain = ''",
    )
    .all() as Array<{ id: string; root_url: string }>;
  const updateDomain = database.prepare(
    "UPDATE dokploy_instances SET root_domain = ? WHERE id = ?",
  );
  const backfillDomains = database.transaction(() => {
    for (const row of rows) {
      try {
        const hostname = new URL(row.root_url).hostname;
        updateDomain.run(hostname.replace(/^dockploy\./, ""), row.id);
      } catch {
        // Invalid legacy URLs remain empty until edited through the dashboard.
      }
    }
  });
  backfillDomains();
}
