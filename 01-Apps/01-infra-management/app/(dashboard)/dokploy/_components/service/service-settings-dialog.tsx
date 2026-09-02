"use client";

import { useEffect, useState } from "react";

import { AppDialog } from "@/components/ui/dialog";
import type {
  DokployDeployment,
  DokployDomain,
  DokployService,
  DokployServiceType,
} from "@/lib/dokploy";
import type {
  GarageBackupConfiguration,
  PostgresBackupConfiguration,
} from "@/lib/dokploy/vendure-backups";

import { ComposeFileEditor } from "../compose/compose-file-editor";
import { GarageBackupControls } from "../compose/garage-backup-controls";
import { DatabaseCredentials } from "../database/database-credentials";
import { PostgresBackupControls } from "../database/postgres-backup-controls";
import { EnvironmentVariableEditor } from "../environment/environment-variable-editor";
import { ResizableEditorPanels } from "./resizable-editor-panels";
import { ServicePageTabs } from "./service-tabs";

type SettingsPayload = {
  id: string;
  name: string;
  appName: string | null;
  env: string;
  credentials: DokployService["credentials"];
  domains: DokployDomain[];
  deployments: DokployDeployment[];
  serviceNames: string[];
  serviceOptions: Array<{ value: string; label: string }>;
  composeFile: string | null;
  buckets: string[];
  garageBackup: GarageBackupConfiguration | null;
  postgresBackup: PostgresBackupConfiguration | null;
  error?: string;
};

export function ServiceSettingsDialog({
  open,
  onClose,
  projectId,
  serviceId,
  serviceName,
  serviceType,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  serviceId: string;
  serviceName: string;
  serviceType: DokployServiceType;
}) {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(
      `/api/dokploy/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceType)}/${encodeURIComponent(serviceId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const result = (await response.json()) as SettingsPayload;
        if (!response.ok)
          throw new Error(result.error || "Unable to load service settings.");
        setPayload(result);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load service settings.",
        );
      });
    return () => controller.abort();
  }, [open, projectId, serviceId, serviceType]);

  const isDatabase = !["applications", "compose"].includes(serviceType);
  function closeDialog() {
    setPayload(null);
    setError("");
    onClose();
  }
  const domainConfig =
    payload && (serviceType === "applications" || serviceType === "compose")
      ? {
          projectId,
          serviceId,
          serviceType,
          appName: payload.appName || payload.name,
          domains: payload.domains,
          serviceNames: payload.serviceNames,
          serviceOptions: payload.serviceOptions,
        }
      : null;

  return (
    <AppDialog
      open={open}
      onClose={closeDialog}
      title={`${serviceName} settings`}
      description="Configure this service without leaving the Dokploy overview."
      width="xl"
    >
      <div className="max-h-[80vh] overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
        {error && (
          <p
            role="alert"
            className="mt-5 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        {!payload && !error && (
          <p className="py-10 text-center text-sm text-gray-500">
            Loading service settings…
          </p>
        )}
        {payload && (
          <ServicePageTabs
            syncWithUrl={false}
            serviceId={serviceId}
            serviceType={serviceType}
            deployments={payload.deployments}
            domainConfig={domainConfig}
            overview={
              <>
                {payload.garageBackup && (
                  <GarageBackupControls
                    projectId={projectId}
                    composeId={serviceId}
                    configuration={payload.garageBackup}
                    buckets={payload.buckets}
                  />
                )}
                {payload.postgresBackup && (
                  <PostgresBackupControls
                    projectId={projectId}
                    postgresId={serviceId}
                    configuration={payload.postgresBackup}
                    buckets={payload.buckets}
                  />
                )}
                {isDatabase && (
                  <DatabaseCredentials
                    credentials={payload.credentials}
                    databaseName={serviceName}
                    inline
                  />
                )}
                {!isDatabase && payload.composeFile !== null && (
                  <ResizableEditorPanels
                    left={
                      <ComposeFileEditor
                        composeId={serviceId}
                        initialValue={payload.composeFile}
                      />
                    }
                    right={
                      <EnvironmentVariableEditor
                        target="service"
                        targetId={serviceId}
                        targetName={payload.name}
                        serviceType={serviceType}
                        initialValue={payload.env}
                        inline
                      />
                    }
                  />
                )}
                {!isDatabase && payload.composeFile === null && (
                  <EnvironmentVariableEditor
                    target="service"
                    targetId={serviceId}
                    targetName={payload.name}
                    serviceType={serviceType}
                    initialValue={payload.env}
                    inline
                  />
                )}
              </>
            }
          />
        )}
      </div>
    </AppDialog>
  );
}
