"use client";

import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export function DatabaseStateControls() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<"export" | "import" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function exportState() {
    setPending("export");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/database-state", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to export database state.");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        "infra-management-state.json";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to export state.",
      );
    } finally {
      setPending(null);
    }
  }

  async function importState(file: File) {
    if (
      !window.confirm(
        "Replace all current Dockploy instances and provisioning state with this file?",
      )
    ) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setPending("import");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/database-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Import failed.");
      setMessage(result.message ?? "Database state imported.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to import state.",
      );
    } finally {
      setPending(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={pending !== null}
          onClick={() => void exportState()}
          className="inline-flex items-center gap-2"
        >
          <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
          {pending === "export" ? "Exporting…" : "Export JSON"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending !== null}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2"
        >
          <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
          {pending === "import" ? "Importing…" : "Import JSON"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importState(file);
          }}
        />
      </div>
      {message && (
        <p
          role="status"
          className="mt-3 text-sm text-emerald-600 dark:text-emerald-400"
        >
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
