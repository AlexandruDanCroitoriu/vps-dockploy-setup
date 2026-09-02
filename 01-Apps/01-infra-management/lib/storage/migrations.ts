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
  `
    ALTER TABLE dokploy_instances
    ADD COLUMN vps_ip TEXT NOT NULL DEFAULT '';
  `,
  `
    ALTER TABLE dokploy_instances
    ADD COLUMN vps_password TEXT NOT NULL DEFAULT '';
  `,
  `
    CREATE TABLE dokploy_provisioning_jobs (
      id TEXT PRIMARY KEY,
      instance_id TEXT,
      name TEXT NOT NULL,
      root_url TEXT NOT NULL UNIQUE,
      root_domain TEXT NOT NULL,
      vps_ip TEXT NOT NULL,
      vps_password TEXT NOT NULL,
      default_service_username TEXT NOT NULL,
      default_service_password TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      steps_json TEXT NOT NULL DEFAULT '{}',
      logs_json TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (instance_id) REFERENCES dokploy_instances(id) ON DELETE SET NULL
    );
  `,
  `
    UPDATE dokploy_provisioning_jobs
    SET steps_json = json_remove(
      CASE
        WHEN json_type(steps_json, '$.starting') IS NOT NULL
          AND json_extract(steps_json, '$.starting') <> 'done'
        THEN json_set(steps_json, '$.installing', json_extract(steps_json, '$.starting'))
        ELSE steps_json
      END,
      '$.connecting', '$.starting'
    );

    UPDATE dokploy_provisioning_jobs
    SET steps_json = json_remove(
      CASE
        WHEN status <> 'complete'
          AND json_type(steps_json, '$.verifying') IS NOT NULL
          AND json_extract(steps_json, '$."api-key"') = 'done'
          AND json_extract(steps_json, '$.verifying') <> 'done'
        THEN json_remove(steps_json, '$."api-key"')
        ELSE steps_json
      END,
      '$.verifying'
    );

    UPDATE dokploy_provisioning_jobs
    SET steps_json = json_replace(
      steps_json,
      '$.updating', CASE WHEN json_extract(steps_json, '$.updating') = 'running' THEN 'error' ELSE json_extract(steps_json, '$.updating') END,
      '$.installing', CASE WHEN json_extract(steps_json, '$.installing') = 'running' THEN 'error' ELSE json_extract(steps_json, '$.installing') END,
      '$.administrator', CASE WHEN json_extract(steps_json, '$.administrator') = 'running' THEN 'error' ELSE json_extract(steps_json, '$.administrator') END,
      '$.domain', CASE WHEN json_extract(steps_json, '$.domain') = 'running' THEN 'error' ELSE json_extract(steps_json, '$.domain') END,
      '$."api-key"', CASE WHEN json_extract(steps_json, '$."api-key"') = 'running' THEN 'error' ELSE json_extract(steps_json, '$."api-key"') END,
      '$."main-project"', CASE WHEN json_extract(steps_json, '$."main-project"') = 'running' THEN 'error' ELSE json_extract(steps_json, '$."main-project"') END,
      '$.zot', CASE WHEN json_extract(steps_json, '$.zot') = 'running' THEN 'error' ELSE json_extract(steps_json, '$.zot') END
    )
    WHERE status = 'failed';
  `,
  `
    CREATE TABLE r2_credentials (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_key_id TEXT NOT NULL,
      secret_access_key TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  `
    DROP TABLE r2_credentials;
  `,
  `
    CREATE TABLE postgres_restore_state (
      instance_id TEXT NOT NULL,
      postgres_id TEXT NOT NULL,
      current_backup_key TEXT NOT NULL DEFAULT '',
      return_backup_key TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (instance_id, postgres_id),
      FOREIGN KEY (instance_id) REFERENCES dokploy_instances(id) ON DELETE CASCADE
    );
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
