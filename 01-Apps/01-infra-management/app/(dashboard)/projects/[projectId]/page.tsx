import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  getActiveDokployConfiguration,
  getDokployGithubProviders,
  getDokployProject,
  getDokployProjects,
} from "@/lib/dokploy";
import { getUnavailableComposeServiceDefinitionIds } from "@/compose-services/registry";
import { getRepositoryApplicationsResult } from "@/lib/github/repository-applications";

import { ProjectCard } from "../_components/project/project-card";
import { ReloadButton } from "../_components/reload-button";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<ProjectLoading />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}

async function ProjectContent({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [
    project,
    projects,
    githubProviders,
    repositoryApplications,
    activeInstance,
  ] = await Promise.all([
    getDokployProject(projectId),
    getDokployProjects(),
    getDokployGithubProviders().catch(() => []),
    getRepositoryApplicationsResult(),
    getActiveDokployConfiguration(),
  ]);

  if (!project) notFound();

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/projects"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
        >
          ← All projects
        </Link>
        <ReloadButton />
      </div>
      <div className="mt-4">
        <ProjectCard
          project={project}
          editableName
          linkServices
          serviceActionsMenu
          githubProviders={githubProviders}
          repositoryApplications={repositoryApplications.applications}
          repositoryApplicationsError={repositoryApplications.error}
          rootDomain={activeInstance?.rootDomain ?? ""}
          defaultServiceCredentials={{
            username: activeInstance?.defaultServiceUsername ?? "admin",
            password: activeInstance?.defaultServicePassword ?? "admin",
          }}
          unavailableComposeDefinitionIds={getUnavailableComposeServiceDefinitionIds(
            projects,
          )}
        />
      </div>
    </div>
  );
}

function ProjectLoading() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-gray-800/50">
      <div className="h-6 w-48 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5" />
        <div className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5" />
      </div>
    </div>
  );
}
