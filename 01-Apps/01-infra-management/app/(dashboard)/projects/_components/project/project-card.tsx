import { CubeIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { Suspense } from "react";

import {
  getDokployDomains,
  getDokployServiceStatus,
  getServiceTypeLabel,
  isDatabaseService,
  type DokployProject,
  type DokployGithubProvider,
  type DokployService,
} from "@/lib/dokploy";
import { composeServiceOptions } from "@/compose-services/registry";
import type { RepositoryApplication } from "@/lib/github/repository-applications";

import { AddDatabaseDialog } from "../database/add-database-dialog";
import { AddApplicationDialog } from "../application/add-application-dialog";
import { AddComposeDialog } from "../compose/add-compose-dialog";
import { EnvironmentVariableEditor } from "../environment/environment-variable-editor";
import { ProjectNameEditor } from "./project-name-editor";
import { ProjectSettingsMenu } from "./project-settings-menu";
import { getServiceDisplayName, ServiceCard } from "../service/service-card";

export function ProjectCard({
  project,
  editableName = false,
  linkServices = false,
  serviceActionsMenu = false,
  githubProviders,
  repositoryApplications,
}: {
  project: DokployProject;
  editableName?: boolean;
  linkServices?: boolean;
  serviceActionsMenu?: boolean;
  githubProviders?: DokployGithubProvider[];
  repositoryApplications?: RepositoryApplication[];
}) {
  const services = project.environments.flatMap((environment) =>
    environment.services.map((service) => ({
      environmentId: environment.environmentId,
      service,
    })),
  );
  const serviceCount = services.length;

  return (
    <article className="relative overflow-visible rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {editableName ? (
                <ProjectNameEditor
                  projectId={project.projectId}
                  initialName={project.name}
                />
              ) : (
                <Link
                  href={`/projects/${encodeURIComponent(project.projectId)}`}
                  className="hover:text-indigo-600 dark:hover:text-indigo-300"
                >
                  {project.name}
                </Link>
              )}
            </h2>
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
                deployedApplications={project.environments.flatMap(
                  (environment) =>
                    environment.services
                      .filter((service) => service.type === "applications")
                      .map((service) => ({
                        name: service.name,
                        sourcePath: service.sourcePath,
                      })),
                )}
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

        {serviceCount === 0 ? (
          <p className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            No services in this project.
          </p>
        ) : (
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
              services={services.map(({ service }) => service)}
              projectId={project.projectId}
              linkServices={linkServices}
              serviceActionsMenu={serviceActionsMenu}
            />
          </Suspense>
        )}
      </div>
    </article>
  );
}

function ServiceCardLoading({ service }: { service: DokployService }) {
  const isDatabase = isDatabaseService(service.type);

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
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {isDatabase
            ? "Checking status…"
            : `${getServiceTypeLabel(service.type)} · Checking status…`}
        </p>
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
}: {
  services: DokployService[];
  projectId: string;
  linkServices: boolean;
  serviceActionsMenu: boolean;
}) {
  const [statusResults, domainResults] = await Promise.all([
    Promise.allSettled(services.map(getDokployServiceStatus)),
    Promise.allSettled(
      services.map((service) =>
        service.type === "applications" || service.type === "compose"
          ? getDokployDomains(service.type, service.id)
          : Promise.resolve([]),
      ),
    ),
  ]);

  return (
    <ul className="mt-3 grid gap-2">
      {services.map((service, index) => (
        <ServiceCard
          key={`${service.type}-${service.id}`}
          service={
            statusResults[index].status === "fulfilled"
              ? statusResults[index].value
              : service
          }
          domains={
            domainResults[index].status === "fulfilled"
              ? domainResults[index].value
              : []
          }
          projectId={projectId}
          serviceActionsMenu={serviceActionsMenu}
          href={
            linkServices
              ? `/projects/${encodeURIComponent(projectId)}/services/${service.type}/${encodeURIComponent(service.id)}`
              : undefined
          }
        />
      ))}
    </ul>
  );
}
