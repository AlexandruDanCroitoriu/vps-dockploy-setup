import { notFound } from "next/navigation";

import {
  isDockerDaemonUnavailableError,
  listLocalDockerImages,
} from "@/lib/docker/local-image-builder";
import { getRepositoryProjects } from "@/lib/repository-projects";
import {
  areProjectBuildsEnabled,
  ensureRepositoryCheckout,
} from "@/lib/repository-workspace";
import { listImageJobs } from "@/lib/docker/image-jobs";
import { getActiveDokployInstanceSummary } from "@/lib/dokploy";
import { getActiveZotRegistry } from "@/lib/zot/active-registry";
import { getZotRegistryImages } from "@/lib/zot/registry-images";

import { ProjectImageCard } from "./_components/project-image-card";
import { RefreshProjectsButton } from "./_components/refresh-projects-button";

export default async function ProjectsPage() {
  if (!areProjectBuildsEnabled()) notFound();
  await ensureRepositoryCheckout();

  const [projects, zotRegistry, activeInstance] = await Promise.all([
    getRepositoryProjects(),
    getActiveZotRegistry().catch(() => null),
    getActiveDokployInstanceSummary(),
  ]);
  const jobs = listImageJobs();
  const projectInventories = await Promise.all(
    projects.map(async (project) => {
      const [localResult, zotResult] = await Promise.all([
        listLocalDockerImages(project.imageRepository).then(
          (images) => ({ images, error: "" }),
          (error) => ({
            images: [],
            error: isDockerDaemonUnavailableError(error)
              ? "Docker is not running."
              : "Unable to load local Docker images.",
          }),
        ),
        zotRegistry
          ? getZotRegistryImages(zotRegistry, project.imageRepository).then(
              (images) => ({ images, error: "" }),
              () => ({
                images: [],
                error: "Unable to load Zot image versions.",
              }),
            )
          : Promise.resolve({ images: [], error: "" }),
      ]);
      return { project, localResult, zotResult };
    }),
  );

  return (
    <div key={activeInstance?.id ?? "no-active-instance"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Projects
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Build production images from local 01-Apps projects, then push them
            to the Zot registry on the active Dokploy instance.
          </p>
        </div>
        <RefreshProjectsButton />
      </div>

      {!zotRegistry && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          No Zot registry with an enabled domain was found on the active Dokploy
          instance. Local builds are available, but pushing is disabled.
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {projectInventories.map(({ project, localResult, zotResult }) => (
          <ProjectImageCard
            key={project.name}
            project={project}
            zotRegistryHost={zotRegistry?.host ?? ""}
            localImages={localResult.images}
            localImagesError={localResult.error}
            dockerAvailable={!localResult.error}
            zotImages={zotResult.images}
            zotImagesError={zotResult.error}
            initialJob={
              jobs.find((job) => job.projectName === project.name) ?? null
            }
          />
        ))}
      </div>
    </div>
  );
}
