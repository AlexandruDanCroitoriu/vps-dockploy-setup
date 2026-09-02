"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { DokployDeployment, DokployServiceType } from "@/lib/dokploy";
import { DeploymentList } from "../deployments/deployment-list";
import { DeploymentLogDialog } from "../deployments/deployment-log-dialog";
import { DomainManager, type DomainConfig } from "../domains/domain-manager";

type Tab = "overview" | "deployments" | "domains";

export function ServicePageTabs({
  overview,
  actions,
  deployments,
  domainConfig,
  loadErrors,
  serviceId,
  serviceType,
  syncWithUrl = true,
}: {
  overview: React.ReactNode;
  actions?: React.ReactNode;
  deployments: DokployDeployment[];
  domainConfig: DomainConfig | null;
  loadErrors?: { deployments?: string; domains?: string };
  serviceId: string;
  serviceType: DokployServiceType;
  syncWithUrl?: boolean;
}) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedActiveTab: Tab =
    requestedTab === "deployments" || requestedTab === "domains"
      ? requestedTab
      : "overview";
  const [dialogTab, setDialogTab] = useState<Tab>("overview");
  const activeTab = syncWithUrl ? requestedActiveTab : dialogTab;
  const [selected, setSelected] = useState<DokployDeployment | null>(null);

  function selectTab(tab: Tab) {
    if (!syncWithUrl) {
      setDialogTab(tab);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }
  return (
    <>
      <div className="mt-4 flex items-end justify-between gap-4 border-b border-gray-200 dark:border-white/10">
        <nav className="flex min-w-0 gap-5" aria-label="Service sections">
          <TabButton
            active={activeTab === "overview"}
            onClick={() => selectTab("overview")}
          >
            Overview
          </TabButton>
          {(deployments.length > 0 || loadErrors?.deployments) && (
            <TabButton
              active={activeTab === "deployments"}
              onClick={() => selectTab("deployments")}
            >
              Deployment logs{" "}
              <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[10px] dark:bg-white/5">
                {deployments.length}
              </span>
            </TabButton>
          )}
          {domainConfig && (
            <TabButton
              active={activeTab === "domains"}
              onClick={() => selectTab("domains")}
            >
              Domains
            </TabButton>
          )}
        </nav>
        {actions && <div className="shrink-0 pb-2">{actions}</div>}
      </div>
      {activeTab === "overview" && overview}
      {activeTab === "deployments" &&
        (loadErrors?.deployments ? (
          <LoadError message={loadErrors.deployments} />
        ) : (
          <DeploymentList deployments={deployments} onOpen={setSelected} />
        ))}
      {activeTab === "domains" &&
        domainConfig &&
        (loadErrors?.domains ? (
          <LoadError message={loadErrors.domains} />
        ) : (
          <DomainManager config={domainConfig} />
        ))}
      {selected && (
        <DeploymentLogDialog
          deployment={selected}
          serviceId={serviceId}
          serviceType={serviceType}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 pb-2 text-xs font-medium ${active ? "border-indigo-500 text-indigo-600 dark:text-indigo-300" : "border-transparent text-gray-500"}`}
    >
      {children}
    </button>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600"
    >
      {message}
    </p>
  );
}
