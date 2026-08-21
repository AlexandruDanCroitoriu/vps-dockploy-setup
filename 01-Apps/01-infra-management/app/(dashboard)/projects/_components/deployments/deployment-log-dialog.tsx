"use client";

import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import { useState } from "react";
import { AppDialog } from "@/components/ui/dialog";
import type { DokployDeployment } from "@/lib/dokploy";
import styles from "./deployment-log-dialog.module.css";

const LazyLog = dynamic(
  () => import("@melloware/react-logviewer").then((module) => module.LazyLog),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center text-sm text-gray-500">
        Loading log viewer…
      </div>
    ),
  },
);
type LogView = "chronological" | "errors-first" | "errors-only";

export function DeploymentLogDialog({
  deployment,
  onClose,
}: {
  deployment: DokployDeployment;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [view, setView] = useState<LogView>("chronological");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  async function copyAll() {
    setCopyStatus("idle");
    try {
      const response = await fetch(
        `/api/dokploy/deployments/${encodeURIComponent(deployment.deploymentId)}/logs`,
      );
      if (!response.ok) throw new Error();
      await navigator.clipboard.writeText(await response.text());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }
  const controls = (
    <>
      <fieldset className="flex rounded-md border border-gray-200 p-0.5">
        <legend className="sr-only">Log view</legend>
        {(
          [
            ["chronological", "All logs"],
            ["errors-first", "Errors first"],
            ["errors-only", "Errors only"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="cursor-pointer">
            <input
              type="radio"
              checked={view === value}
              onChange={() => setView(value)}
              className="peer sr-only"
            />
            <span className="block rounded px-2.5 py-1.5 text-[11px] peer-checked:bg-gray-100 dark:peer-checked:bg-white/10">
              {label}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        onClick={copyAll}
        className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs"
      >
        <ClipboardDocumentIcon className="size-4" />
        Copy all
      </button>
      {copyStatus !== "idle" && (
        <span className="text-xs" role="status">
          {copyStatus === "copied" ? "Copied" : "Copy failed"}
        </span>
      )}
    </>
  );
  return (
    <AppDialog
      open
      onClose={onClose}
      title={deployment.title || "Deployment logs"}
      description={<code>{deployment.deploymentId}</code>}
      width="xl"
      headerActions={controls}
    >
      <div className="p-3">
        {error ? (
          <div className="flex h-96 items-center justify-center text-sm text-red-600">
            {error}
          </div>
        ) : (
          <div className="h-[min(70vh,35rem)] overflow-auto rounded-lg bg-[#090d14]">
            <LazyLog
              key={`${deployment.deploymentId}-${view}`}
              url={`/api/dokploy/deployments/${encodeURIComponent(deployment.deploymentId)}/logs?pretty=1${view === "chronological" ? "" : `&view=${view}`}`}
              fetchOptions={{ credentials: "same-origin" }}
              height={560}
              width="100%"
              caseInsensitive
              enableGutters
              enableHotKeys
              enableLineNumbers
              enableSearch
              enableSearchNavigation
              extraLines={1}
              follow={false}
              selectableLines
              rowHeight={22}
              className={styles.viewer}
              searchBarClassName={styles.search}
              onError={() => setError("Unable to load deployment logs.")}
              style={{
                backgroundColor: "#090d14",
                color: "#d1d5db",
                fontFamily: "ui-monospace, monospace",
                fontSize: 11.5,
              }}
            />
          </div>
        )}
      </div>
    </AppDialog>
  );
}
