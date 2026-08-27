"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { refreshZotRegistryAction } from "../_actions/build-image";

export function RefreshZotButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-[11px] text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        aria-label={
          pending ? "Refreshing Zot registry" : "Refresh Zot registry"
        }
        title="Check whether Zot is deployed and reload its image versions"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
        onClick={() =>
          startTransition(async () => {
            setError("");
            const result = await refreshZotRegistryAction();
            if (result.status === "error") {
              setError(result.message);
              return;
            }
            router.refresh();
          })
        }
      >
        <ArrowPathIcon
          className={`size-3.5 ${pending ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {pending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
