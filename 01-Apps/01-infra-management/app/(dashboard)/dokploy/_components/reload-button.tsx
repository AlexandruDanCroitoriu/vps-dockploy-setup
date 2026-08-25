"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { refreshDokployDataAction } from "../_actions/refresh";

export function ReloadButton({ label = "Reload" }: { label?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() =>
        startTransition(async () => {
          await refreshDokployDataAction();
          void fetch("/api/dokploy/warm", { method: "POST" });
        })
      }
      disabled={isPending}
      aria-label={isPending ? "Reloading" : label}
      className="inline-flex items-center gap-1.5"
    >
      <ArrowPathIcon
        aria-hidden="true"
        className={`size-4 ${isPending ? "animate-spin" : ""}`}
      />
      {isPending ? "Reloading…" : label}
    </Button>
  );
}
