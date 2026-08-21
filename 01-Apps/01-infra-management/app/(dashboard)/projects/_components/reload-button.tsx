"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

export function ReloadButton({ label = "Reload" }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => startTransition(() => router.refresh())}
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
