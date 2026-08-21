import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  getDokployGithubProviders,
  getDokployProject,
} from "@/lib/dokploy";
import { getRepositoryApplications } from "@/lib/github/repository-applications";

import { ProjectCard } from "../_components/project/project-card";

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
  const [project, githubProviders, repositoryApplications] = await Promise.all([
    getDokployProject(projectId),
    getDokployGithubProviders().catch(() => []),
    getRepositoryApplications().catch(() => []),
  ]);

  if (!project) notFound();

  return (
    <div>
      <Link
        href="/projects"
        className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
      >
        ← All projects
      </Link>
      <div className="mt-4">
        <ProjectCard
          project={project}
          editableName
          linkServices
          showDeployButtons
          githubProviders={githubProviders}
          repositoryApplications={repositoryApplications}
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
