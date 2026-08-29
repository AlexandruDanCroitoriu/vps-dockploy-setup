import { CubeIcon, FolderIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Suspense } from "react";

import {
  shouldPollDokployServiceStatus,
  type DokployProject,
  type DokployGithubProvider,
  type DokployService,
} from "@/lib/dokploy";
import { getServicePresentationSnapshot } from "@/lib/dokploy/service-presentation-snapshot";
import { composeServiceOptions } from "@/compose-services/registry";
import type { RepositoryApplication } from "@/lib/github/repository-applications";
import {
  getRepositoryApplicationDeployments,
  type RepositoryApplicationDeployment,
} from "@/lib/github/repository-applications";

import { AddDatabaseDialog } from "../database/add-database-dialog";
import { AddApplicationDialog } from "../application/add-application-dialog";
import { AddComposeDialog } from "../compose/add-compose-dialog";
import { EnvironmentVariableEditor } from "../environment/environment-variable-editor";
import { ProjectNameEditor } from "./project-name-editor";
import { ProjectSettingsMenu } from "./project-settings-menu";
import { getServiceDisplayName, ServiceCard } from "../service/service-card";
import {
  OptimisticProjectServices,
  OptimisticServiceVisibilityGuard,
} from "../service/optimistic-project-services";
import { ServiceStatusRefresh } from "../service/service-status-refresh";
import { DeletedServiceGuard } from "../service/deleted-service-guard";
import { ServiceTemplateDropdown } from "../service-template/service-template-dropdown";

export function ProjectCard({
  project,
  editableName = false,
  linkServices = false,
  serviceActionsMenu = false,
  githubProviders,
  repositoryApplications,
  repositoryApplicationsError,
  infraManagementImageAvailability,
  vendureBackendImageAvailability,
  vendureStorefrontImageAvailability,
  rootDomain,
  defaultServiceCredentials,
  dokployRootUrl = "",
  unavailableComposeDefinitionIds = [],
  deployedRepositoryApplications,
}: {
  project: DokployProject;
  editableName?: boolean;
  linkServices?: boolean;
  serviceActionsMenu?: boolean;
  githubProviders?: DokployGithubProvider[];
  repositoryApplications?: RepositoryApplication[];
  repositoryApplicationsError?: string;
  infraManagementImageAvailability?: {
    available: boolean;
    message: string;
  };
  vendureBackendImageAvailability?: { available: boolean; message: string };
  vendureStorefrontImageAvailability?: Record<
    string,
    { available: boolean; message: string }
  >;
  rootDomain: string;
  defaultServiceCredentials: { username: string; password: string };
  dokployRootUrl?: string;
  unavailableComposeDefinitionIds?: string[];
  deployedRepositoryApplications?: RepositoryApplicationDeployment[];
}) {
  const services = project.environments.flatMap((environment) =>
    environment.services.map((service) => ({
      environmentId: environment.environmentId,
      service,
    })),
  );
  const serviceCount = services.length;
  const vendureBackendDeployment = services
    .map(({ service }) => service)
    .find(
      (service) =>
        service.type === "applications" &&
        (service.name.toLowerCase() === "vendure" ||
          service.sourcePath?.toLowerCase() ===
            "/01-apps/02-online-store-vendure/apps/server"),
    );

  return (
    <article className="relative overflow-visible rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              {dokployRootUrl && project.environments[0]?.environmentId && (
                <a
                  href={`${dokployRootUrl}/dashboard/project/${encodeURIComponent(project.projectId)}/environment/${encodeURIComponent(project.environments[0].environmentId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${project.name} in Dokploy`}
                  aria-label={`Open ${project.name} in Dokploy`}
                  className="shrink-0 rounded p-1 text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                >
                  <FolderIcon className="size-4" aria-hidden="true" />
                </a>
              )}
              <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                {editableName ? (
                  <ProjectNameEditor
                    projectId={project.projectId}
                    initialName={project.name}
                  />
                ) : (
                  <Link
                    href={`/dokploy/${encodeURIComponent(project.projectId)}`}
                    className="hover:text-indigo-600 dark:hover:text-indigo-300"
                  >
                    {project.name}
                  </Link>
                )}
              </h2>
            </div>
            {project.description && (
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-white/5 dark:text-gray-300">
              {serviceCount} {serviceCount === 1 ? "service" : "services"}
            </span>
            {githubProviders && repositoryApplications && (
              <AddApplicationDialog
                projectId={project.projectId}
                environments={project.environments.map((environment) => ({
                  environmentId: environment.environmentId,
                  name: environment.name,
                }))}
                githubProviders={githubProviders}
                repositoryApplications={repositoryApplications}
                repositoryApplicationsError={repositoryApplicationsError ?? ""}
                infraManagementImageAvailability={
                  infraManagementImageAvailability ?? {
                    available: false,
                    message: "Unable to verify infra-management:latest in Zot.",
                  }
                }
                vendureBackendImageAvailability={
                  vendureBackendImageAvailability ?? {
                    available: false,
                    message:
                      "Unable to verify online-store-vendure-server:latest in Zot.",
                  }
                }
                vendureStorefrontImageAvailability={
                  vendureStorefrontImageAvailability ?? {}
                }
                rootDomain={rootDomain}
                deployedApplications={
                  deployedRepositoryApplications ??
                  getRepositoryApplicationDeployments([project])
                }
                vendureBackendDeployment={
                  vendureBackendDeployment
                    ? {
                        id: vendureBackendDeployment.id,
                        name: vendureBackendDeployment.name,
                        sourcePath: vendureBackendDeployment.sourcePath,
                      }
                    : undefined
                }
              />
            )}
            <AddDatabaseDialog
              projectId={project.projectId}
              environments={project.environments.map((environment) => ({
                environmentId: environment.environmentId,
                name: environment.name,
              }))}
            />
            <AddComposeDialog
              projectId={project.projectId}
              environmentId={project.environments[0]?.environmentId}
              definitions={composeServiceOptions}
              rootDomain={rootDomain}
              defaultLoginCredentials={defaultServiceCredentials}
              unavailableDefinitionIds={unavailableComposeDefinitionIds}
            />
            <ServiceTemplateDropdown
              projectId={project.projectId}
              environmentExists={project.environments.length > 0}
              rootDomain={rootDomain}
              services={services.map(({ service }) => ({
                type: service.type,
                name: service.name,
              }))}
            />
            <EnvironmentVariableEditor
              target="project"
              targetId={project.projectId}
              targetName={project.name}
              initialValue={project.env}
            />
            <ProjectSettingsMenu
              projectId={project.projectId}
              projectName={project.name}
              services={services.map(({ service }) => ({
                id: service.id,
                type: service.type,
                name: getServiceDisplayName(service),
              }))}
            />
          </div>
        </div>

        <OptimisticProjectServices
          projectId={project.projectId}
          existingServices={services.map(({ service }) => ({
            id: service.id,
            name: service.name,
            type: service.type,
          }))}
        >
          {serviceCount > 0 && (
            <Suspense
              fallback={
                <ul className="mt-3 grid gap-2">
                  {services.map(({ environmentId, service }) => (
                    <ServiceCardLoading
                      key={`${environmentId}-${service.type}-${service.id}`}
                      service={service}
                    />
                  ))}
                </ul>
              }
            >
              <ProjectServices
                services={services}
                projectId={project.projectId}
                linkServices={linkServices}
                serviceActionsMenu={serviceActionsMenu}
                dokployRootUrl={dokployRootUrl}
              />
            </Suspense>
          )}
        </OptimisticProjectServices>
      </div>
    </article>
  );
}

function ServiceCardLoading({ service }: { service: DokployService }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-md border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-gray-900/50">
      <CubeIcon className="size-4 shrink-0 text-indigo-500" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-gray-400" />
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {getServiceDisplayName(service)}
          </p>
        </div>
      </div>
      <span className="size-7 shrink-0 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
    </li>
  );
}

async function ProjectServices({
  services,
  projectId,
  linkServices,
  serviceActionsMenu,
  dokployRootUrl,
}: {
  services: Array<{ environmentId: string; service: DokployService }>;
  projectId: string;
  linkServices: boolean;
  serviceActionsMenu: boolean;
  dokployRootUrl: string;
}) {
  const presentation = await getServicePresentationSnapshot(
    projectId,
    services.map(({ service }) => service),
  );
  const resolvedServices = presentation.services;

  return (
    <>
      <ServiceStatusRefresh
        active={resolvedServices.some((service) =>
          shouldPollDokployServiceStatus(service),
        )}
      />
      <ul className="mt-3 grid gap-2">
        {resolvedServices.map((service, index) => (
          <DeletedServiceGuard
            key={`${service.type}-${service.id}`}
            projectId={projectId}
            serviceId={service.id}
          >
            <OptimisticServiceVisibilityGuard service={service}>
              <ServiceCard
                service={service}
                dokployHref={
                  dokployRootUrl
                    ? `${dokployRootUrl}/dashboard/project/${encodeURIComponent(projectId)}/environment/${encodeURIComponent(services[index].environmentId)}/services/${service.type === "applications" ? "application" : service.type}/${encodeURIComponent(service.id)}`
                    : undefined
                }
                domains={presentation.domains[index] ?? []}
                projectId={projectId}
                serviceActionsMenu={serviceActionsMenu}
                href={
                  linkServices
                    ? `/dokploy/${encodeURIComponent(projectId)}/services/${service.type}/${encodeURIComponent(service.id)}`
                    : undefined
                }
              />
            </OptimisticServiceVisibilityGuard>
          </DeletedServiceGuard>
        ))}
      </ul>
    </>
  );
}
