"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { refreshProjectSourceAction } from "../_actions/build-image";

export function RefreshProjectsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="text-right">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        aria-label={pending ? "Refreshing projects" : "Refresh projects"}
        className="inline-flex items-center gap-1.5"
        onClick={() =>
          startTransition(async () => {
            setError("");
            const result = await refreshProjectSourceAction();
            if (result.status === "error") {
              setError(result.message);
              return;
            }
            router.refresh();
          })
        }
      >
        <ArrowPathIcon
          className={`size-4 ${pending ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {pending ? "Refreshing…" : "Refresh projects"}
      </Button>
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
