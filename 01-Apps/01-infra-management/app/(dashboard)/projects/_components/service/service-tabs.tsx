"use client";

import { useState } from "react";
import type { DokployDeployment, DokployServiceType } from "@/lib/dokploy";
import { DeploymentList } from "../deployments/deployment-list";
import { DeploymentLogDialog } from "../deployments/deployment-log-dialog";
import { DomainManager, type DomainConfig } from "../domains/domain-manager";

type Tab = "overview" | "deployments" | "domains";

export function ServicePageTabs({
  overview,
  deployments,
  domainConfig,
  loadErrors,
  serviceId,
  serviceType,
}: {
  overview: React.ReactNode;
  deployments: DokployDeployment[];
  domainConfig: DomainConfig | null;
  loadErrors?: { deployments?: string; domains?: string };
  serviceId: string;
  serviceType: DokployServiceType;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<DokployDeployment | null>(null);
  return (
    <>
      <div className="mt-4 border-b border-gray-200 dark:border-white/10">
        <nav className="flex gap-5" aria-label="Service sections">
          <TabButton
            active={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </TabButton>
          {(deployments.length > 0 || loadErrors?.deployments) && (
            <TabButton
              active={activeTab === "deployments"}
              onClick={() => setActiveTab("deployments")}
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
              onClick={() => setActiveTab("domains")}
            >
              Domains
            </TabButton>
          )}
        </nav>
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
      className="mt-4 max-w-3xl rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600"
    >
      {message}
    </p>
  );
}
