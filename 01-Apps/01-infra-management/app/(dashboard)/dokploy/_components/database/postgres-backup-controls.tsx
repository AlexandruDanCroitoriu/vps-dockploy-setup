"use client";

import { CircleStackIcon } from "@heroicons/react/24/outline";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { ActionMessage } from "@/components/ui/form-field";
import type { PostgresBackupConfiguration } from "@/lib/dokploy/vendure-backups";

import {
  restorePostgresBackupAction,
  runPostgresBackupAction,
  updatePostgresBackupAction,
} from "../../_actions/databases";
import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

function RecoveryPointRow({
  projectId,
  postgresId,
  point,
}: {
  projectId: string;
  postgresId: string;
  point: PostgresBackupConfiguration["recoveryPoints"][number];
}) {
  const [state, action, pending] = useActionState(
    restorePostgresBackupAction.bind(null, projectId, postgresId),
    initialState,
  );
  const label = point.returnPoint ? "Return to present" : "Restore";
  return (
    <li className="rounded-lg border border-gray-200 p-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {point.modifiedAt
                ? new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(point.modifiedAt)) + " UTC"
                : point.key.split("/").pop()}
            </p>
            {point.current ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                Current
              </span>
            ) : null}
            {point.returnPoint ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                Present
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-gray-500" title={point.key}>
            {point.size === null
              ? "Unknown size"
              : `${(point.size / 1024 / 1024).toFixed(1)} MB`}{" "}
            · {point.key}
          </p>
        </div>
        <form
          action={action}
          onSubmit={(event) => {
            if (
              !window.confirm(
                `${label} using this backup? The database will be unavailable while its contents are replaced.`,
              )
            )
              event.preventDefault();
          }}
        >
          <input type="hidden" name="backupKey" value={point.key} />
          <Button
            type="submit"
            size="xs"
            variant={point.returnPoint ? "primary" : "secondary"}
            disabled={point.current || pending}
          >
            {pending ? "Restoring…" : point.current ? "Current" : label}
          </Button>
        </form>
      </div>
      <ActionMessage status={state.status} message={state.message} />
    </li>
  );
}

export function PostgresBackupControls({
  projectId,
  postgresId,
  buckets,
  configuration,
}: {
  projectId: string;
  postgresId: string;
  buckets: string[];
  configuration: PostgresBackupConfiguration;
}) {
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, saving] = useActionState(
    updatePostgresBackupAction.bind(null, projectId, postgresId),
    initialState,
  );
  const [runState, runAction, running] = useActionState(
    runPostgresBackupAction.bind(null, projectId, postgresId),
    initialState,
  );

  return (
    <div className="shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        title="PostgreSQL backup settings"
        aria-label="PostgreSQL backup settings"
        onClick={() => setOpen(true)}
      >
        <CircleStackIcon className="size-5" aria-hidden="true" />
      </Button>
      <AppDialog
        open={open}
        onClose={() => setOpen(false)}
        title="PostgreSQL backup configuration"
        description="Back up this database directly to Cloudflare R2 every day."
        width="compact"
      >
        <form action={saveAction} className="space-y-4 p-5 sm:p-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            R2 bucket
            <select
              name="bucket"
              required
              defaultValue={configuration.bucket}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-gray-950"
            >
              <option value="" disabled>
                Select a bucket
              </option>
              {buckets.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {bucket}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Backup folder
            <input
              name="prefix"
              required
              maxLength={200}
              pattern="[a-zA-Z0-9/_-]+"
              defaultValue={configuration.prefix}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-gray-950"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Daily backup time
            <input
              name="time"
              type="time"
              required
              defaultValue={configuration.time}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-white/10 dark:bg-gray-950"
            />
          </label>
          <ActionMessage
            status={saveState.status}
            message={saveState.message}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!buckets.length || saving}>
              {saving ? "Saving…" : "Save configuration"}
            </Button>
          </div>
        </form>
        <div className="border-t border-gray-200 px-5 py-4 sm:px-6 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create an R2 backup immediately.
            </p>
            <form action={runAction}>
              <Button
                type="submit"
                disabled={!configuration.configured || running}
              >
                {running ? "Backing up…" : "Create backup now"}
              </Button>
            </form>
          </div>
          <ActionMessage status={runState.status} message={runState.message} />
        </div>
        <div className="border-t border-gray-200 px-5 py-4 sm:px-6 dark:border-white/10">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Previous backups
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Restoring first creates a safety backup. Use Return to present to
            undo the restore.
          </p>
          {configuration.recoveryPoints.length ? (
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {configuration.recoveryPoints.map((point) => (
                <RecoveryPointRow
                  key={point.key}
                  projectId={projectId}
                  postgresId={postgresId}
                  point={point}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              No backups are available yet.
            </p>
          )}
        </div>
      </AppDialog>
    </div>
  );
}
