"use client";

import { PencilIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  CloudflareDnsRecord,
  CloudflareZone,
} from "@/lib/cloudflare/zones";
import {
  createSubdomainAction,
  deleteSubdomainAction,
  updateAllARecordsAction,
  updateSubdomainAction,
} from "./actions";

type CloudflareDisplayZone = Omit<CloudflareZone, "ipAddress">;

export function CloudflareZoneList({
  zones,
}: {
  zones: CloudflareDisplayZone[];
}) {
  return (
    <ul className="grid gap-4 p-4 md:grid-cols-2">
      {zones.map((zone) => (
        <CloudflareZoneRow key={zone.id} zone={zone} />
      ))}
    </ul>
  );
}

function CloudflareZoneRow({ zone }: { zone: CloudflareDisplayZone }) {
  const [adding, setAdding] = useState(false);
  const [editingIps, setEditingIps] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function createRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("");
    startTransition(async () => {
      const result = await createSubdomainAction({
        zoneId: zone.id,
        zoneName: zone.name,
        label: data.get("label")?.toString() ?? "",
      });
      if (result.status === "success") {
        setMessage("");
        form.reset();
        setAdding(false);
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  function updateAllARecords(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      const result = await updateAllARecordsAction({
        zoneId: zone.id,
        ipAddress: data.get("ipAddress")?.toString() ?? "",
      });
      setMessage(result.message);
      if (result.status === "success") {
        setEditingIps(false);
        router.refresh();
      }
    });
  }

  return (
    <li className="min-w-0 rounded-lg border border-gray-200 p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-4">
        <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {zone.name}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              zone.status === "active" && !zone.paused
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
            }`}
          >
            {zone.paused ? "paused" : zone.status}
          </span>
          <button
            type="button"
            onClick={() => {
              setAdding((value) => !value);
              setMessage("");
            }}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <PlusIcon className="size-3.5" aria-hidden="true" />
            Add subdomain
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingIps((value) => !value);
              setMessage("");
            }}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/10"
          >
            Change all A record IPs
          </button>
        </div>
      </div>

      {editingIps && (
        <form
          onSubmit={updateAllARecords}
          className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-gray-900/40"
        >
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">New IP address for all A records</span>
              <input
                name="ipAddress"
                required
                autoFocus
                inputMode="decimal"
                placeholder="192.0.2.1"
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm outline-none dark:border-white/10 dark:bg-gray-900"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Updating…" : "Update all"}
            </button>
          </div>
        </form>
      )}

      {adding && (
        <form
          onSubmit={createRecord}
          className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-gray-900/40"
        >
          <div className="flex gap-2">
            <label className="min-w-0">
              <span className="sr-only">Subdomain name</span>
              <div className="flex h-9 rounded-md border border-gray-300 bg-white dark:border-white/10 dark:bg-gray-900">
                <input
                  name="label"
                  required
                  autoFocus
                  placeholder="app"
                  className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
                />
                <span className="flex items-center border-l border-gray-200 px-2 text-xs text-gray-500 dark:border-white/10">
                  .{zone.name}
                </span>
              </div>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}

      {zone.subdomains.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          No subdomains found.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 border-l border-gray-200 pl-3 dark:border-white/10">
          {zone.subdomains.map((record) => (
            <CloudflareRecordRow key={record.id} zone={zone} record={record} />
          ))}
        </ul>
      )}
      {message && (
        <p
          role="status"
          className="mt-2 text-xs text-gray-600 dark:text-gray-300"
        >
          {message}
        </p>
      )}
    </li>
  );
}

function CloudflareRecordRow({
  zone,
  record,
}: {
  zone: CloudflareDisplayZone;
  record: CloudflareDnsRecord;
}) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const suffix = `.${zone.name}`;
  const label = record.name.endsWith(suffix)
    ? record.name.slice(0, -suffix.length)
    : record.name;

  function updateRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateSubdomainAction({
        zoneId: zone.id,
        zoneName: zone.name,
        recordId: record.id,
        label: data.get("label")?.toString() ?? "",
        ...(record.type === "A"
          ? { ipAddress: data.get("ipAddress")?.toString() ?? "" }
          : {}),
      });
      setMessage(result.message);
      if (result.status === "success") {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!window.confirm(`Delete ${record.name} (${record.type})?`)) return;
    setMessage("");
    startTransition(async () => {
      const result = await deleteSubdomainAction({
        zoneId: zone.id,
        recordId: record.id,
      });
      setMessage(result.message);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <li className="rounded-md border border-gray-200 p-2.5 dark:border-white/10">
      {editing ? (
        <form
          onSubmit={updateRecord}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex h-8 min-w-0 flex-1 rounded-md border border-gray-300 dark:border-white/10">
            <input
              name="label"
              required
              autoFocus
              defaultValue={label}
              className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"
            />
            <span className="flex items-center border-l border-gray-200 px-2 text-xs text-gray-500 dark:border-white/10">
              .{zone.name}
            </span>
          </div>
          {record.type === "A" && (
            <label>
              <span className="sr-only">IP address</span>
              <input
                name="ipAddress"
                required
                inputMode="decimal"
                defaultValue={record.content}
                className="h-8 w-32 rounded-md border border-gray-300 bg-transparent px-2 text-xs outline-none dark:border-white/10"
              />
            </label>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-2 py-1.5 text-xs text-gray-500"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {record.type}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-800 dark:text-gray-200">
              {label}
            </p>
            {record.type === "A" && (
              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                {record.content}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setMessage("");
            }}
            aria-label={`Edit ${record.name}`}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <PencilIcon className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label={`Delete ${record.name}`}
            className="rounded p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:hover:bg-red-500/10"
          >
            <TrashIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="mt-1.5 text-xs text-gray-500">
          {message}
        </p>
      )}
    </li>
  );
}
