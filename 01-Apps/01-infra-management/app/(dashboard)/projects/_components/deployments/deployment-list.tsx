"use client";

import { DocumentTextIcon } from "@heroicons/react/24/outline";
import type { DokployDeployment } from "@/lib/dokploy";
import { StatusBadge } from "@/components/ui/status-badge";

export function DeploymentList({
  deployments,
  onOpen,
}: {
  deployments: DokployDeployment[];
  onOpen: (deployment: DokployDeployment) => void;
}) {
  return (
    <div className="mt-4 max-w-3xl overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
      <ul className="divide-y divide-gray-200 dark:divide-white/10">
        {deployments.map((deployment) => (
          <li key={deployment.deploymentId}>
            <button
              type="button"
              onClick={() => onOpen(deployment)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]"
            >
              <DocumentTextIcon className="size-4 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {deployment.title || "Deployment"}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {formatDate(deployment.createdAt)}
                </span>
              </span>
              <DeploymentStatusBadge status={deployment.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d{3}Z$/, " UTC");
}

export function DeploymentStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized.includes("success") || normalized.includes("done")
      ? "success"
      : normalized.includes("running") || normalized.includes("progress")
        ? "warning"
        : normalized.includes("fail") || normalized.includes("error")
          ? "danger"
          : "neutral";
  return <StatusBadge tone={tone}>{status || "Unknown"}</StatusBadge>;
}
