"use server";

import path from "node:path";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { getDokployInstanceSummaries } from "@/lib/dokploy";
import { invalidateDokployMemoryState } from "@/lib/dokploy/instance-memory-state";
import { clearDokployRenderSnapshots } from "@/lib/dokploy/render-snapshot-cache";
import {
  buildDockerImage,
  deleteLocalDockerImage,
  isValidDockerTag,
  listLocalDockerImages,
  pushDockerImage,
  tagDockerImageVersion,
} from "@/lib/docker/local-image-builder";
import { startImageJob, type ImageJob } from "@/lib/docker/image-jobs";
import {
  getRepositoryAppsDirectory,
  getRepositoryProjects,
} from "@/lib/repository-projects";
import {
  areProjectBuildsEnabled,
  ensureRepositoryCheckout,
  refreshRepositoryCheckout,
} from "@/lib/repository-workspace";
import { type ActiveZotRegistry } from "@/lib/zot/active-registry";
import {
  getInstanceZotRegistries,
  getInstanceZotRegistry,
} from "@/lib/zot/instance-registries";
import {
  deleteZotRegistryImage,
  getZotRegistryImages,
  invalidateZotRegistryMemoryState,
  removeCurrentZotRegistryImage,
} from "@/lib/zot/registry-images";

export type BuildImageState = {
  status: "idle" | "running" | "success" | "error";
  message: string;
  image?: string;
  job?: ImageJob;
};

type ImageRequest = {
  image: string;
  jobKey: string;
  projectName: string;
  projectDirectory: string;
  repository: string;
  tag: string;
};

export async function refreshZotRegistryAction(): Promise<BuildImageState> {
  if (!areProjectBuildsEnabled()) {
    return { status: "error", message: "Local projects are disabled." };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { status: "error", message: "Your session has expired." };
  }

  const registries = await getInstanceZotRegistries();
  for (const instance of getDokployInstanceSummaries()) {
    invalidateDokployMemoryState(instance.id);
    clearDokployRenderSnapshots(instance.id);
  }
  for (const target of registries) {
    if (target.registry) invalidateZotRegistryMemoryState(target.registry.host);
  }
  return { status: "success", message: "Zot registry refreshed." };
}

export async function refreshProjectSourceAction(): Promise<BuildImageState> {
  if (!areProjectBuildsEnabled()) {
    return { status: "error", message: "Project builds are disabled." };
  }
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { status: "error", message: "Your session has expired." };
  }
  try {
    await refreshRepositoryCheckout();
    return { status: "success", message: "Project source refreshed." };
  } catch {
    return { status: "error", message: "Unable to refresh project source." };
  }
}

async function getImageRequest(
  formData: FormData,
): Promise<{ error: BuildImageState } | ImageRequest> {
  if (!areProjectBuildsEnabled()) {
    return {
      error: { status: "error", message: "Local image builds are disabled." },
    };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      error: { status: "error", message: "Your session has expired." },
    };
  }

  const projectName = String(formData.get("projectName") ?? "");
  const targetId = String(formData.get("targetId") ?? "default");
  const tag = String(formData.get("tag") ?? "").trim();
  if (!isValidDockerTag(tag)) {
    return {
      error: { status: "error", message: "Enter a valid Docker image tag." },
    };
  }

  await ensureRepositoryCheckout();
  const appsDirectory = getRepositoryAppsDirectory();
  const project = (await getRepositoryProjects(appsDirectory)).find(
    (candidate) => candidate.name === projectName,
  );
  const target = project?.imageTargets.find(
    (candidate) => candidate.id === targetId,
  );
  if (!project || !target || !target.available) {
    return {
      error: {
        status: "error",
        message: "The selected repository image target does not have a Dockerfile.",
      },
    };
  }

  return {
    image: `${target.imageRepository}:${tag}`,
    jobKey: `${project.name}:${target.id}`,
    projectName: project.name,
    projectDirectory: path.join(
      appsDirectory,
      project.name,
      target.contextPath,
    ),
    repository: target.imageRepository,
    tag,
  };
}

async function buildRequestedImage(request: ImageRequest) {
  const retainedVersion =
    request.tag === "latest"
      ? await tagDockerImageVersion(request.repository, request.tag).catch(
          () => "",
        )
      : "";
  const result = await buildDockerImage({
    projectDirectory: request.projectDirectory,
    image: request.image,
  });
  return { image: result.image, retainedVersion };
}

async function pushRequestedImage(
  request: ImageRequest,
  registry: ActiveZotRegistry,
  previousVersions: Awaited<ReturnType<typeof listLocalDockerImages>> = [],
  replaceCurrent = true,
) {
  for (const version of previousVersions.filter((image) => !image.current)) {
    await pushDockerImage({
      localImage: `${version.name}:${version.tag}`,
      registryImage: `${registry.host}/${version.name}:${version.tag}`,
      registryHost: registry.host,
      username: registry.username,
      password: registry.password,
    });
  }
  if (replaceCurrent) {
    await removeCurrentZotRegistryImage(registry, request.repository);
  }
  const result = await pushDockerImage({
    localImage: request.image,
    registryImage: `${registry.host}/${request.image}`,
    registryHost: registry.host,
    username: registry.username,
    password: registry.password,
  });
  invalidateZotRegistryMemoryState(registry.host);
  return result;
}

export async function pushProjectImageToRegistryAction(
  _previousState: BuildImageState,
  formData: FormData,
): Promise<BuildImageState> {
  const request = await getImageRequest(formData);
  if ("error" in request) return request.error;

  try {
    const instanceId = String(formData.get("instanceId") ?? "");
    const registry = await getInstanceZotRegistry(instanceId);
    if (!registry) {
      return {
        status: "error",
        message: "The selected instance Zot registry is unavailable.",
      };
    }
    const localImage = (await listLocalDockerImages(request.repository)).find(
      (image) => image.tag === request.tag,
    );
    if (!localImage) {
      return { status: "error", message: "The selected local image no longer exists." };
    }
    await pushRequestedImage(request, registry, [], localImage.current);
    return {
      status: "success",
      message: `Pushed ${request.image} to ${registry.host}.`,
    };
  } catch {
    return {
      status: "error",
      message: `Unable to push ${request.image} to the selected Zot registry.`,
    };
  }
}

export async function deleteLocalProjectImageAction(
  _previousState: BuildImageState,
  formData: FormData,
): Promise<BuildImageState> {
  const request = await getImageRequest(formData);
  if ("error" in request) return request.error;

  try {
    await deleteLocalDockerImage(request.image);
    return {
      status: "success",
      message: `Deleted local image ${request.image}.`,
    };
  } catch {
    return {
      status: "error",
      message: `Unable to delete ${request.image}. Stop containers using it and try again.`,
    };
  }
}

export async function deleteZotProjectImageAction(
  _previousState: BuildImageState,
  formData: FormData,
): Promise<BuildImageState> {
  const request = await getImageRequest(formData);
  if ("error" in request) return request.error;

  try {
    const instanceId = String(formData.get("instanceId") ?? "");
    const registry = await getInstanceZotRegistry(instanceId);
    if (!registry) {
      return {
        status: "error",
        message: "The selected instance Zot registry is unavailable.",
      };
    }
    const digest = String(formData.get("digest") ?? "");
    const registryImage = (
      await getZotRegistryImages(registry, request.repository)
    ).find((image) => image.tag === request.tag && image.digest === digest);
    if (!registryImage) {
      return { status: "error", message: "The Zot image no longer exists." };
    }
    await deleteZotRegistryImage(
      registry,
      request.repository,
      registryImage.tag,
    );
    return {
      status: "success",
      message: `Deleted ${registry.host}/${request.image}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : `Unable to delete ${request.image} from Zot.`,
    };
  }
}

export async function buildProjectImageAction(
  _previousState: BuildImageState,
  formData: FormData,
): Promise<BuildImageState> {
  const request = await getImageRequest(formData);
  if ("error" in request) return request.error;

  const job = startImageJob(request.jobKey, "build", async () => {
    try {
      const result = await buildRequestedImage(request);
      return {
        status: "success" as const,
        message: result.retainedVersion
          ? `Built ${result.image}; the previous image remains as ${result.retainedVersion}.`
          : `Built ${result.image}.`,
      };
    } catch {
      return {
        status: "error" as const,
        message: `Docker build failed for ${request.image}.`,
      };
    }
  });
  return { status: job.status, message: job.message, job };
}

export async function buildAndPushProjectImageAction(
  _previousState: BuildImageState,
  formData: FormData,
): Promise<BuildImageState> {
  const request = await getImageRequest(formData);
  if ("error" in request) return request.error;

  const job = startImageJob(request.jobKey, "build-push", async () => {
    try {
      await buildRequestedImage(request);

      const registries = (await getInstanceZotRegistries()).flatMap((target) =>
        target.registry ? [target.registry] : [],
      );
      if (registries.length === 0) {
        return {
          status: "error" as const,
          message: "The image was built, but no Zot registry is available.",
        };
      }
      const results = await Promise.allSettled(
        registries.map((registry) => pushRequestedImage(request, registry)),
      );
      const pushed = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      if (pushed !== registries.length) {
        return {
          status: "error" as const,
          message: `Built the image and pushed it to ${pushed} of ${registries.length} Zot registries.`,
        };
      }
      return {
        status: "success" as const,
        message: `Built the image and pushed it to all ${pushed} Zot registries.`,
      };
    } catch {
      return {
        status: "error" as const,
        message: `Unable to build and push ${request.image}. Verify Docker and the Zot registry are available.`,
      };
    }
  });
  return { status: job.status, message: job.message, job };
}

export async function pushProjectImageToAllRegistriesAction(
  _previousState: BuildImageState,
  formData: FormData,
): Promise<BuildImageState> {
  const request = await getImageRequest(formData);
  if ("error" in request) return request.error;

  const job = startImageJob(request.jobKey, "push", async () => {
    try {
      const localVersions = await listLocalDockerImages(request.repository);
      if (localVersions.length === 0) {
        return {
          status: "error" as const,
          message: `Build a local ${request.repository} image before pushing.`,
        };
      }
      const registries = (await getInstanceZotRegistries()).flatMap((target) =>
        target.registry ? [target.registry] : [],
      );
      if (registries.length === 0) {
        return {
          status: "error" as const,
          message:
            "Create and deploy a Zot service with an enabled domain before pushing.",
        };
      }
      const results = await Promise.allSettled(
        registries.map((registry) =>
          pushRequestedImage(request, registry, localVersions),
        ),
      );
      const pushed = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      if (pushed !== registries.length) {
        return {
          status: "error" as const,
          message: `Pushed the image to ${pushed} of ${registries.length} Zot registries.`,
        };
      }
      return {
        status: "success" as const,
        message: `Pushed the image to all ${pushed} Zot registries.`,
      };
    } catch {
      return {
        status: "error" as const,
        message: `Docker push failed for ${request.image}. Build it first and verify the Zot service is reachable.`,
      };
    }
  });
  return { status: job.status, message: job.message, job };
}
