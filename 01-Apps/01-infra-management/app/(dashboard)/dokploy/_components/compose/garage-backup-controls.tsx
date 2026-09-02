"use client";

import { useActionState, useState } from "react";
import { CircleStackIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { ActionMessage } from "@/components/ui/form-field";
import type { GarageBackupConfiguration } from "@/lib/dokploy/vendure-backups";

import {
  runGarageBackupAction,
  updateGarageBackupAction,
} from "../../_actions/composes";
import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

export function GarageBackupControls({
  projectId,
  composeId,
  buckets,
  configuration,
  compact = false,
}: {
  projectId: string;
  composeId: string;
  buckets: string[];
  configuration: GarageBackupConfiguration;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, saving] = useActionState(
    updateGarageBackupAction.bind(null, projectId, composeId),
    initialState,
  );
  const [runState, runAction, running] = useActionState(
    runGarageBackupAction.bind(null, projectId, composeId),
    initialState,
  );

  const dialog = (
    <AppDialog
      open={open}
      onClose={() => setOpen(false)}
      title="Garage backup configuration"
      description="PostgreSQL runs one hour before this time when the project contains the managed Vendure database."
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
        <ActionMessage status={saveState.status} message={saveState.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!buckets.length || saving}>
            {saving ? "Saving…" : "Save configuration"}
          </Button>
        </div>
      </form>
      {compact && (
        <div className="border-t border-gray-200 px-5 py-4 sm:px-6 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Run PostgreSQL first, then both Garage volumes.
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
      )}
    </AppDialog>
  );

  if (compact) {
    return (
      <div className="shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          title="Garage backup settings"
          aria-label="Garage backup settings"
          onClick={() => setOpen(true)}
        >
          <CircleStackIcon className="size-5" aria-hidden="true" />
        </Button>
        {dialog}
      </div>
    );
  }

  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-800/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            Garage backups
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {configuration.configured
              ? `${configuration.bucket}/${configuration.prefix} every day at ${configuration.time}`
              : "Daily R2 backups are not configured."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            Backup configuration
          </Button>
          <form action={runAction}>
            <Button
              type="submit"
              disabled={!configuration.configured || running}
            >
              {running ? "Backing up…" : "Create backup now"}
            </Button>
          </form>
        </div>
      </div>
      <ActionMessage status={runState.status} message={runState.message} />

      {dialog}
    </section>
  );
}
