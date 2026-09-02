import "server-only";

import { getDatabase } from "./database";

export function getPostgresRestoreState(
  instanceId: string,
  postgresId: string,
) {
  return (
    (getDatabase()
      .prepare(
        `SELECT current_backup_key currentBackupKey,
                return_backup_key returnBackupKey
         FROM postgres_restore_state
         WHERE instance_id = ? AND postgres_id = ?`,
      )
      .get(instanceId, postgresId) as
      { currentBackupKey: string; returnBackupKey: string } | undefined) ?? {
      currentBackupKey: "",
      returnBackupKey: "",
    }
  );
}

export function savePostgresRestoreState(input: {
  instanceId: string;
  postgresId: string;
  currentBackupKey: string;
  returnBackupKey: string;
}) {
  getDatabase()
    .prepare(
      `INSERT INTO postgres_restore_state
       (instance_id, postgres_id, current_backup_key, return_backup_key, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(instance_id, postgres_id) DO UPDATE SET
         current_backup_key = excluded.current_backup_key,
         return_backup_key = excluded.return_backup_key,
         updated_at = excluded.updated_at`,
    )
    .run(
      input.instanceId,
      input.postgresId,
      input.currentBackupKey,
      input.returnBackupKey,
      new Date().toISOString(),
    );
}
