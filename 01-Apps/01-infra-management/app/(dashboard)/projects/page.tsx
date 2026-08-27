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
import { getInstanceZotRegistries } from "@/lib/zot/instance-registries";
import { getFreshZotRegistryImages } from "@/lib/zot/registry-images";

import { ProjectImageCard } from "./_components/project-image-card";
import { RefreshProjectsButton } from "./_components/refresh-projects-button";

export default async function ProjectsPage() {
  if (!areProjectBuildsEnabled()) notFound();
  await ensureRepositoryCheckout();

  const [projects, instanceRegistries] = await Promise.all([
    getRepositoryProjects(),
    getInstanceZotRegistries(),
  ]);
  const jobs = listImageJobs();
  const projectInventories = await Promise.all(
    projects.map(async (project) => {
      const [localResult, registryResults] = await Promise.all([
        listLocalDockerImages(project.imageRepository).then(
          (images) => ({ images, error: "" }),
          (error) => ({
            images: [],
            error: isDockerDaemonUnavailableError(error)
              ? "Docker is not running."
              : "Unable to load local Docker images.",
          }),
        ),
        Promise.all(
          instanceRegistries.map(async (target) => ({
            instanceId: target.instanceId,
            instanceName: target.instanceName,
            host: target.registry?.host ?? "",
            ...(target.registry
              ? await getFreshZotRegistryImages(
                  target.registry,
                  project.imageRepository,
                ).then(
                  (images) => ({ images, error: "" }),
                  () => ({
                    images: [],
                    error: "Unable to load Zot image versions.",
                  }),
                )
              : { images: [], error: "" }),
          })),
        ),
      ]);
      return { project, localResult, registryResults };
    }),
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Projects
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Build production images from local 01-Apps projects, then push them
            to the Zot registries on your configured Dokploy instances.
          </p>
        </div>
        <RefreshProjectsButton />
      </div>

      {!instanceRegistries.some((target) => target.registry) && (
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          No Zot registry with an enabled domain was found on any configured
          Dokploy instance. Local builds are available, but pushing is disabled.
        </div>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {projectInventories.map(({ project, localResult, registryResults }) => (
          <ProjectImageCard
            key={project.name}
            project={project}
            registries={registryResults}
            localImages={localResult.images}
            localImagesError={localResult.error}
            dockerAvailable={!localResult.error}
            initialJob={
              jobs.find((job) => job.projectName === project.name) ?? null
            }
          />
        ))}
      </div>
    </div>
  );
}
