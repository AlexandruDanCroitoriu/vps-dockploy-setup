"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ActionMessage } from "@/components/ui/form-field";
import type { CloudflareR2Bucket } from "@/lib/cloudflare/r2";

import {
  createR2BucketAction,
  deleteR2BucketAction,
  syncR2BucketAction,
  type R2ActionState,
} from "./actions";

const initialState: R2ActionState = { status: "idle", message: "" };

function DeleteBucketButton({ name }: { name: string }) {
  const [state, action, pending] = useActionState(
    deleteR2BucketAction,
    initialState,
  );
  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={action}
        onSubmit={(event) => {
          if (!window.confirm(`Delete the empty R2 bucket ${name}?`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="name" value={name} />
        <Button type="submit" variant="danger" size="xs" disabled={pending}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </form>
      <ActionMessage status={state.status} message={state.message} />
    </div>
  );
}

export function R2Buckets({
  buckets,
  destinationStatuses,
}: {
  buckets: CloudflareR2Bucket[];
  destinationStatuses: Array<{
    instanceId: string;
    instanceName: string;
    buckets: Record<string, boolean>;
    error: string;
  }>;
}) {
  const [state, action, pending] = useActionState(
    createR2BucketAction,
    initialState,
  );
  return (
    <>
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-800/40">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Create bucket
        </h2>
        <form action={action} className="mt-4 flex flex-wrap items-start gap-3">
          <label className="min-w-64 flex-1">
            <span className="sr-only">Bucket name</span>
            <input
              name="name"
              required
              minLength={3}
              maxLength={63}
              pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]"
              placeholder="vendure-production-backups"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-900"
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create bucket"}
          </Button>
        </form>
        <ActionMessage status={state.status} message={state.message} />
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Buckets ({buckets.length})
          </h2>
        </div>
        {buckets.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">
            No R2 buckets were found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Storage class</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Dokploy access</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                {buckets.map((bucket) => (
                  <tr key={bucket.name}>
                    <td className="px-5 py-3 font-medium">{bucket.name}</td>
                    <td className="px-5 py-3">
                      {bucket.location} · {bucket.jurisdiction}
                    </td>
                    <td className="px-5 py-3">{bucket.storageClass}</td>
                    <td className="px-5 py-3">
                      {bucket.creationDate
                        ? new Date(bucket.creationDate).toLocaleString()
                        : "Unknown"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {destinationStatuses.length ? (
                          destinationStatuses.map((status) => (
                            <span
                              key={status.instanceId}
                              title={status.error || status.instanceName}
                              className={
                                status.buckets[bucket.name]
                                  ? "rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                                  : "rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
                              }
                            >
                              {status.instanceName}:{" "}
                              {status.buckets[bucket.name]
                                ? "Ready"
                                : "Missing"}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500">
                            No instances
                          </span>
                        )}
                        <SyncBucketButton name={bucket.name} />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DeleteBucketButton name={bucket.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function SyncBucketButton({ name }: { name: string }) {
  const [state, action, pending] = useActionState(
    syncR2BucketAction,
    initialState,
  );
  return (
    <div>
      <form action={action}>
        <input type="hidden" name="name" value={name} />
        <Button type="submit" variant="secondary" size="xs" disabled={pending}>
          {pending ? "Syncing…" : "Sync"}
        </Button>
      </form>
      <ActionMessage status={state.status} message={state.message} />
    </div>
  );
}
