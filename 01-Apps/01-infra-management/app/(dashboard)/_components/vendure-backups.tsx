"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ActionMessage } from "@/components/ui/form-field";
import type { VendureBackupOverview } from "@/lib/dokploy/vendure-backups";

import { runVendureBackupsAction } from "../_actions/backups";
import type { ActionState } from "../dokploy/_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

function formatSize(size: number | null) {
  if (size === null) return "Unknown size";
  if (size < 1_000) return `${size} B`;
  if (size < 1_000_000) return `${(size / 1_000).toFixed(1)} KB`;
  if (size < 1_000_000_000) return `${(size / 1_000_000).toFixed(1)} MB`;
  return `${(size / 1_000_000_000).toFixed(1)} GB`;
}

function formatDate(value: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function VendureBackups({
  overview,
}: {
  overview: VendureBackupOverview;
}) {
  const [state, action, pending] = useActionState(
    runVendureBackupsAction,
    initialState,
  );
  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-800/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Vendure backups
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            PostgreSQL is backed up directly to Cloudflare R2 before the Garage
            volumes are copied to R2.
          </p>
        </div>
        <form action={action}>
          <Button type="submit" disabled={!overview.configured || pending}>
            {pending ? "Backing up…" : "Create backup now"}
          </Button>
        </form>
      </div>
      <ActionMessage status={state.status} message={state.message} />
      {overview.error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          {overview.error}
        </p>
      )}
      {!overview.error && !overview.configured && (
        <p className="mt-4 text-sm text-gray-500">
          No managed Vendure backup jobs were found on this instance.
        </p>
      )}
      {overview.jobs.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Backup</th>
                <th className="px-3 py-2">Destination</th>
                <th className="px-3 py-2">Schedule</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              {overview.jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-2">{job.projectName}</td>
                  <td className="px-3 py-2">{job.name}</td>
                  <td className="px-3 py-2">{job.target}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {job.schedule || "Manual"}
                  </td>
                  <td className="px-3 py-2">
                    {job.enabled ? "Enabled" : "Disabled"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">
        R2 backup files
      </h3>
      {overview.r2Files.length ? (
        <ul className="mt-2 divide-y divide-gray-200 text-sm dark:divide-white/10">
          {overview.r2Files.map((file) => (
            <li
              key={file.key}
              className="flex flex-wrap justify-between gap-2 py-2"
            >
              <span className="font-mono text-xs break-all">{file.key}</span>
              <span className="text-gray-500">
                {formatSize(file.size)} · {formatDate(file.modifiedAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-gray-500">
          No R2 backup files were returned by Dokploy yet.
        </p>
      )}
    </section>
  );
}
