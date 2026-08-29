import { notFound } from "next/navigation";
import { CubeIcon } from "@heroicons/react/24/outline";

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
import {
  getFreshZotRegistryImages,
  getZotRegistryImageConfigDigest,
} from "@/lib/zot/registry-images";

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
    projects.flatMap((project) =>
      project.imageTargets.map(async (target) => {
      const localResult = await listLocalDockerImages(target.imageRepository).then(
          (images) => ({ images, error: "" }),
          (error) => ({
            images: [],
            error: isDockerDaemonUnavailableError(error)
              ? "Docker is not running."
              : "Unable to load local Docker images.",
          }),
        );
        const registries = await Promise.all(
          instanceRegistries.map(async (registryTarget) => ({
            instanceId: registryTarget.instanceId,
            instanceName: registryTarget.instanceName,
            host: registryTarget.registry?.host ?? "",
            publishedImages: registryTarget.registry
              ? await getFreshZotRegistryImages(
                  registryTarget.registry,
                  target.imageRepository,
                ).then(
                  async (images) =>
                    Promise.all(
                      images
                        .filter((image) =>
                          localResult.images.some(
                            (localImage) => localImage.tag === image.tag,
                          ),
                        )
                        .map(async (image) => ({
                          tag: image.tag,
                          digest: image.digest,
                          configDigest:
                            await getZotRegistryImageConfigDigest(
                              registryTarget.registry!,
                              target.imageRepository,
                              image.tag,
                            ),
                        })),
                    ),
                  () => [],
                )
              : [],
          })),
        );
        return { project, target, localResult, registries };
      }),
    ),
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

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-2">
        {projects.map((project) => {
          const inventories = projectInventories.filter(
            (inventory) => inventory.project.name === project.name,
          );
          const cards = inventories.map(
            ({ target, localResult, registries }) => (
              <ProjectImageCard
                key={`${project.name}:${target.id}`}
                project={project}
                target={target}
                registries={registries}
                localImages={localResult.images}
                localImagesError={localResult.error}
                dockerAvailable={!localResult.error}
                initialJob={
                  jobs.find(
                    (job) =>
                      job.projectName === `${project.name}:${target.id}`,
                  ) ?? null
                }
                embedded={inventories.length > 1}
              />
            ),
          );
          if (inventories.length <= 1) return cards[0] ?? null;
          return (
            <article
              key={project.name}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-gray-800/50"
            >
              <div className="flex min-w-0 items-center gap-3 border-b border-gray-200 pb-4 dark:border-white/10">
                <div className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                  <CubeIcon className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                    {project.name}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                    {project.path}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/5 dark:text-gray-400">
                  {inventories.length} images
                </span>
              </div>
              <div className="ml-1 border-l border-gray-200 dark:border-white/10">
                {cards}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
