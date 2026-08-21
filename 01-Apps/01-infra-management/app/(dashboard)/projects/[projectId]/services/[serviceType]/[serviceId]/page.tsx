import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  DOKPLOY_SERVICE_TYPES,
  getDokployDeployments,
  getDokployDomainServiceNames,
  getDokployDomains,
  getDokployRunningContainerOptions,
  getDokployProject,
  getDokployService,
  getDokployServiceStatus,
  type DokployServiceType,
} from "@/lib/dokploy";

import {
  getServiceDisplayName,
  ServiceCard,
} from "../../../../_components/project/project-card";
import { DatabaseCredentials } from "../../../../_components/database/database-credentials";
import { EnvironmentVariableEditor } from "../../../../_components/environment/environment-variable-editor";
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
  const [deploymentsResult, namesResult, containersResult, domainsResult] =
    await Promise.allSettled([
      getDokployDeployments(resolvedService),
      getDokployDomainServiceNames(resolvedService),
      getDokployRunningContainerOptions(resolvedService),
      domainsPromise,
    ]);
  const deployments =
    deploymentsResult.status === "fulfilled" ? deploymentsResult.value : [];
  const domainServiceNames =
    namesResult.status === "fulfilled" ? namesResult.value : [];
  const runningContainerOptions =
    containersResult.status === "fulfilled" ? containersResult.value : [];
  const domains =
    domainsResult.status === "fulfilled" ? domainsResult.value : [];
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

  return (
    <div>
      <Link
        href={`/projects/${encodeURIComponent(project.projectId)}`}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
      >
        ← {project.name}
      </Link>
      <div className="mt-4 flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-xl font-semibold text-gray-900 dark:text-gray-100">
          {getServiceDisplayName(service)}
        </h1>
        <ReloadButton />
      </div>
      <ServicePageTabs
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
                serviceNames:
                  domainServiceNames.length > 0
                    ? domainServiceNames
                    : [resolvedService.appName || resolvedService.name],
                serviceOptions:
                  runningContainerOptions.length > 0
                    ? runningContainerOptions
                    : (domainServiceNames.length > 0
                        ? domainServiceNames
                        : [resolvedService.appName || resolvedService.name]
                      ).map((name) => ({ value: name, label: name })),
              }
            : null
        }
        overview={
          <>
            <ul className="mt-4 max-w-3xl">
              <ServiceCard
                service={resolvedService}
                domains={domains}
                showCredentialsButton={!isDatabase}
                showEnvironmentEditor={false}
              />
            </ul>
            {isDatabase && (
              <DatabaseCredentials
                credentials={resolvedService.credentials}
                databaseName={getServiceDisplayName(resolvedService)}
                inline
              />
            )}
            {!isDatabase && (
              <EnvironmentVariableEditor
                target="service"
                targetId={resolvedService.id}
                targetName={resolvedService.name}
                serviceType={resolvedService.type}
                initialValue={resolvedService.env}
                inline
              />
            )}
          </>
        }
      />
    </div>
  );
}

function ServiceLoading() {
  return (
    <div className="max-w-3xl rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-800/40">
      <div className="h-5 w-40 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
      <div className="mt-4 h-16 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
    </div>
  );
}
