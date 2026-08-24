import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  DOKPLOY_SERVICE_TYPES,
  getDokployDeployments,
  getDokployDomainServiceNames,
  getDokployDomains,
  getDokployRunningContainerOptions,
  getDokployProject,
  getDokployRawComposeFile,
  getDokployService,
  getDokployServiceStatus,
  type DokployServiceType,
} from "@/lib/dokploy";

import {
  getServiceDisplayName,
  ServiceCard,
} from "../../../../_components/service/service-card";
import { DatabaseCredentials } from "../../../../_components/database/database-credentials";
import { ComposeFileEditor } from "../../../../_components/compose/compose-file-editor";
import { EnvironmentVariableEditor } from "../../../../_components/environment/environment-variable-editor";
import { ResizableEditorPanels } from "../../../../_components/service/resizable-editor-panels";
import { ServicePageTabs } from "../../../../_components/service/service-tabs";
import { ReloadButton } from "../../../../_components/reload-button";

export default function ServicePage({
  params,
}: {
  params: Promise<{
    projectId: string;
    serviceType: string;
    serviceId: string;
  }>;
}) {
  return (
    <Suspense fallback={<ServiceLoading />}>
      <ServiceContent params={params} />
    </Suspense>
  );
}

async function ServiceContent({
  params,
}: {
  params: Promise<{
    projectId: string;
    serviceType: string;
    serviceId: string;
  }>;
}) {
  const { projectId, serviceType, serviceId } = await params;

  if (!DOKPLOY_SERVICE_TYPES.includes(serviceType as DokployServiceType)) {
    notFound();
  }

  const type = serviceType as DokployServiceType;
  const [project, service] = await Promise.all([
    getDokployProject(projectId),
    getDokployService(projectId, type, serviceId),
  ]);

  if (!project || !service) notFound();

  const resolvedService = await getDokployServiceStatus(service);
  const isDatabase = !["applications", "compose"].includes(
    resolvedService.type,
  );
  const supportsDomains =
    resolvedService.type === "applications" ||
    resolvedService.type === "compose";
  const domainsPromise = supportsDomains
    ? getDokployDomains(
        resolvedService.type as "applications" | "compose",
        resolvedService.id,
      )
    : Promise.resolve([]);
  const composeFilePromise =
    resolvedService.type === "compose"
      ? getDokployRawComposeFile(resolvedService.id)
      : Promise.resolve(null);
  const [
    deploymentsResult,
    namesResult,
    containersResult,
    domainsResult,
    composeFileResult,
  ] = await Promise.allSettled([
    getDokployDeployments(resolvedService),
    getDokployDomainServiceNames(resolvedService),
    getDokployRunningContainerOptions(resolvedService),
    domainsPromise,
    composeFilePromise,
  ]);
  const deployments =
    deploymentsResult.status === "fulfilled" ? deploymentsResult.value : [];
  const domainServiceNames =
    namesResult.status === "fulfilled" ? namesResult.value : [];
  const runningContainerOptions =
    containersResult.status === "fulfilled" ? containersResult.value : [];
  const domains =
    domainsResult.status === "fulfilled" ? domainsResult.value : [];
  const composeFile =
    composeFileResult.status === "fulfilled" ? composeFileResult.value : null;
  const loadErrors = {
    deployments:
      deploymentsResult.status === "rejected"
        ? "Unable to load deployments."
        : "",
    domains:
      supportsDomains && domainsResult.status === "rejected"
        ? "Unable to load configured domains."
        : "",
  };
  const fallbackServiceNames =
    resolvedService.type === "applications"
      ? [resolvedService.appName || resolvedService.name]
      : [];
  const resolvedDomainServiceNames =
    domainServiceNames.length > 0 ? domainServiceNames : fallbackServiceNames;

  return (
    <div>
      <ul>
        <ServiceCard
          service={resolvedService}
          domains={domains}
          projectId={project.projectId}
          serviceActionsMenu
          serviceDeleteRedirectHref={`/dokploy/${encodeURIComponent(project.projectId)}`}
          showCredentialsButton={!isDatabase}
          showEnvironmentEditor={false}
        />
      </ul>
      <ServicePageTabs
        actions={<ReloadButton />}
        serviceId={resolvedService.id}
        serviceType={resolvedService.type}
        deployments={deployments}
        loadErrors={loadErrors}
        domainConfig={
          resolvedService.type === "applications" ||
          resolvedService.type === "compose"
            ? {
                projectId: project.projectId,
                serviceId: resolvedService.id,
                serviceType: resolvedService.type,
                appName: resolvedService.appName || resolvedService.name,
                domains,
                serviceNames: resolvedDomainServiceNames,
                serviceOptions:
                  runningContainerOptions.length > 0
                    ? runningContainerOptions
                    : resolvedDomainServiceNames.map((name) => ({
                        value: name,
                        label: name,
                      })),
              }
            : null
        }
        overview={
          <>
            {isDatabase && (
              <DatabaseCredentials
                credentials={resolvedService.credentials}
                databaseName={getServiceDisplayName(resolvedService)}
                inline
              />
            )}
            {!isDatabase && composeFile !== null && (
              <ResizableEditorPanels
                left={
                  <ComposeFileEditor
                    composeId={resolvedService.id}
                    initialValue={composeFile}
                  />
                }
                right={
                  <EnvironmentVariableEditor
                    target="service"
                    targetId={resolvedService.id}
                    targetName={resolvedService.name}
                    serviceType={resolvedService.type}
                    initialValue={resolvedService.env}
                    inline
                  />
                }
              />
            )}
            {!isDatabase && composeFile === null && (
              <div className="[&>section]:max-w-none">
                <EnvironmentVariableEditor
                  target="service"
                  targetId={resolvedService.id}
                  targetName={resolvedService.name}
                  serviceType={resolvedService.type}
                  initialValue={resolvedService.env}
                  inline
                />
                {resolvedService.type === "compose" &&
                  composeFileResult.status === "rejected" && (
                    <p
                      role="alert"
                      className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
                    >
                      Unable to load the raw Compose file.
                    </p>
                  )}
              </div>
            )}
          </>
        }
      />
    </div>
  );
}

function ServiceLoading() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-800/40">
      <div className="h-5 w-40 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
      <div className="mt-4 h-16 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
    </div>
  );
}
