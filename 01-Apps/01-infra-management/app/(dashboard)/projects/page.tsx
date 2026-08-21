import { Suspense } from "react";

import { getDokployProjects } from "@/lib/dokploy";

import { ProjectCard } from "./_components/project/project-card";
import { CreateProjectDialog } from "./_components/project/create-project-dialog";

export default function ProjectsPage() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Projects
        </h1>
        <CreateProjectDialog />
      </div>

      <Suspense fallback={<ProjectsLoading />}>
        <ProjectsContent />
      </Suspense>
    </div>
  );
}

function ProjectsLoading() {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-800/40">
      <div className="flex items-center gap-3">
        <span className="size-3 animate-pulse rounded-full bg-indigo-500" />
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Loading projects from Dokploy…
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Waiting for the project and environment list.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="h-20 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
        <div className="h-20 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
      </div>
    </div>
  );
}

async function ProjectsContent() {
  const projects = await getDokployProjects();

  return (
    <>
      {projects.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-white/15 dark:text-gray-400">
          No projects were returned by Dokploy.
        </div>
      ) : (
        <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.projectId} project={project} />
          ))}
        </div>
      )}
    </>
  );
}
