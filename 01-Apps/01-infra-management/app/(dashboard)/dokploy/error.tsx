"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function DokployError({ retry }: { retry: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-500/20 dark:bg-red-500/5">
      <h1 className="text-lg font-semibold text-red-800 dark:text-red-300">
        Unable to connect to Dokploy
      </h1>
      <p className="mt-1 text-sm text-red-700 dark:text-red-300/80">
        The selected instance is not responding. It may have been reinstalled,
        stopped, or its domain and API key may no longer be valid.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={retry}>
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Edit or remove instance
        </Link>
      </div>
    </div>
  );
}
