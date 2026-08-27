"use client";

import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { refreshCloudflareAction } from "./actions";

export function CloudflareDomainsHeader({ count }: { count: number }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function refresh() {
    setMessage("");
    startTransition(async () => {
      const result = await refreshCloudflareAction();
      setMessage(result.message);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-white/10">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Domains
        </h2>
        {message && (
          <p role="status" className="mt-0.5 text-xs text-gray-500">
            {message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {count} {count === 1 ? "domain" : "domains"}
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
        >
          <ArrowPathIcon
            className={`size-3.5 ${pending ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {pending ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
