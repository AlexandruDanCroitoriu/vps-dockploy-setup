"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { DokployInstanceSummary } from "@/lib/storage/dokploy-instances";
import {
  clearActiveDokployInstanceAction,
  selectDokployInstanceAction,
} from "../../_actions/dokploy-instances";

const ADD_INSTANCE_VALUE = "__add_dokploy__";

export function DokployInstanceSelector({
  instances,
  activeInstanceId,
  onNavigate,
}: {
  instances: DokployInstanceSummary[];
  activeInstanceId: string | null;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div>
      <label htmlFor="dockploy-instance" className="sr-only">
        Dockploy instance
      </label>
      <select
        id="dockploy-instance"
        value={
          searchParams.get("addDockploy") === "1"
            ? ADD_INSTANCE_VALUE
            : (activeInstanceId ?? ADD_INSTANCE_VALUE)
        }
        disabled={pending}
        onChange={(event) => {
          const instanceId = event.target.value;
          setError("");
          if (instanceId === ADD_INSTANCE_VALUE) {
            startTransition(async () => {
              const result = await clearActiveDokployInstanceAction();
              if (result.status === "error") {
                setError(result.message);
                return;
              }
              onNavigate?.();
              router.push("/?addDockploy=1");
              router.refresh();
            });
            return;
          }
          startTransition(async () => {
            const result = await selectDokployInstanceAction(instanceId);
            if (result.status === "error") {
              setError(result.message);
              return;
            }
            onNavigate?.();
            router.refresh();
          });
        }}
        className="block w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm font-medium text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-white/10 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value={ADD_INSTANCE_VALUE}>Add new Dockploy</option>
        {instances.map((instance) => (
          <option key={instance.id} value={instance.id}>
            {instance.name}
          </option>
        ))}
      </select>
      {error && (
        <p
          role="status"
          className="mt-1 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
