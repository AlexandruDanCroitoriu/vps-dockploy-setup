"use client";

import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AppDialog } from "@/components/ui/dialog";
import type { DokployDeployment, DokployServiceType } from "@/lib/dokploy";
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

function isActiveDeploymentStatus(status: string) {
  const normalized = status.toLowerCase();
  return ["queue", "pending", "running", "progress", "build", "deploy"].some(
    (value) => normalized.includes(value),
  );
}

export function DeploymentLogDialog({
  deployment,
  serviceId,
  serviceType,
  onClose,
}: {
  deployment: DokployDeployment;
  serviceId: string;
  serviceType: DokployServiceType;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [view, setView] = useState<LogView>("chronological");
  const [logs, setLogs] = useState("");
  const [status, setStatus] = useState(deployment.status);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const canLoadStatus =
    serviceType === "applications" || serviceType === "compose";
  const isPolling = canLoadStatus && isActiveDeploymentStatus(status);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function loadLogs() {
      try {
        const search = new URLSearchParams({ pretty: "1" });
        if (view !== "chronological") search.set("view", view);
        if (canLoadStatus) {
          search.set("serviceId", serviceId);
          search.set("serviceType", serviceType);
        }
        const response = await fetch(
          `/api/dokploy/deployments/${encodeURIComponent(deployment.deploymentId)}/logs?${search}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) throw new Error();
        const nextLogs = await response.text();
        const nextStatus =
          response.headers.get("x-deployment-status") || deployment.status;
        setLogs(nextLogs);
        setStatus(nextStatus);
        setError("");
        if (canLoadStatus && isActiveDeploymentStatus(nextStatus)) {
          timeout = setTimeout(loadLogs, 1_000);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Unable to load deployment logs.");
        }
      }
    }

    void loadLogs();
    return () => {
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [
    canLoadStatus,
    deployment.deploymentId,
    deployment.status,
    serviceId,
    serviceType,
    view,
  ]);

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
      <fieldset className="flex rounded-md border border-gray-300 p-0.5 text-gray-700 dark:border-white/20 dark:text-gray-200">
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
            <span className="block rounded px-2.5 py-1.5 text-[11px] text-gray-700 peer-checked:bg-gray-100 peer-checked:text-gray-950 dark:text-gray-300 dark:peer-checked:bg-white/10 dark:peer-checked:text-white">
              {label}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        onClick={copyAll}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-300 px-2.5 text-xs text-gray-700 hover:bg-gray-100 dark:border-white/20 dark:text-gray-200 dark:hover:bg-white/10"
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
      description={
        <span className="flex items-center gap-2">
          <code>{deployment.deploymentId}</code>
          {isPolling && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300">
              <span className="size-1.5 animate-pulse rounded-full bg-current" />
              Updating every second
            </span>
          )}
        </span>
      }
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
              text={logs}
              height={560}
              width="100%"
              caseInsensitive
              enableGutters
              enableHotKeys
              enableLineNumbers
              enableSearch
              enableSearchNavigation
              extraLines={1}
              follow={isPolling}
              selectableLines
              rowHeight={22}
              className={styles.viewer}
              searchBarClassName={styles.search}
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
