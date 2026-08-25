"use server";

import path from "node:path";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  buildDockerImage,
  deleteLocalDockerImage,
  isValidDockerTag,
  listLocalDockerImages,
  pushDockerImage,
  tagDockerImageVersion,
} from "@/lib/docker/local-image-builder";
import {
  getRepositoryAppsDirectory,
  getRepositoryProjects,
} from "@/lib/repository-projects";
import { getActiveZotRegistry } from "@/lib/zot/active-registry";
import {
  deleteZotRegistryImage,
  getZotRegistryImages,
  invalidateZotRegistryMemoryState,
} from "@/lib/zot/registry-images";

export type BuildImageState = {
  status: "idle" | "success" | "error";
  message: string;
  image?: string;
};

async function getImageRequest(
  formData: FormData,
  options: { requireDockerfile?: boolean } = {},
): Promise<
  | { error: BuildImageState }
  | {
      image: string;
      projectDirectory: string;
      repository: string;
      tag: string;
    }
> {
  if (process.env.NODE_ENV !== "development") {
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
  const tag = String(formData.get("tag") ?? "").trim();
  if (!isValidDockerTag(tag)) {
    return {
      error: { status: "error", message: "Enter a valid Docker image tag." },
    };
  }

  const appsDirectory = getRepositoryAppsDirectory();
  const project = (await getRepositoryProjects(appsDirectory)).find(
    (candidate) => candidate.name === projectName,
  );
  if (
    !project ||
    (options.requireDockerfile !== false && !project.hasDockerfile)
  ) {
    return {
      error: {
        status: "error",
        message: "The selected repository project does not have a Dockerfile.",
      },
    };
  }

  return {
    image: `${project.imageRepository}:${tag}`,
    projectDirectory: path.join(appsDirectory, project.name),
    repository: project.imageRepository,
    tag,
  };
}

export async function deleteLocalProjectImageAction(
  _previousState: BuildImageState,
  formData: FormData,
): Promise<BuildImageState> {
  const request = await getImageRequest(formData, { requireDockerfile: false });
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
  const request = await getImageRequest(formData, { requireDockerfile: false });
  if ("error" in request) return request.error;

  try {
    const registry = await getActiveZotRegistry();
    if (!registry) {
      return {
        status: "error",
        message: "The active Zot registry is unavailable.",
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

  try {
    let retainedVersion = "";
    if (request.tag === "latest") {
      retainedVersion = await tagDockerImageVersion(
        request.repository,
        request.tag,
      ).catch(() => "");
    }
    const result = await buildDockerImage({
      projectDirectory: request.projectDirectory,
      image: request.image,
    });
    return {
      status: "success",
      message: retainedVersion
        ? `Built ${result.image}; the previous image remains as ${retainedVersion}.`
        : `Built ${result.image}.`,
      image: result.image,
    };
  } catch {
    return {
      status: "error",
      message: `Docker build failed for ${request.image}.`,
    };
  }
}

export async function pushProjectImageAction(
  _previousState: BuildImageState,
  formData: FormData,
): Promise<BuildImageState> {
  const request = await getImageRequest(formData);
  if ("error" in request) return request.error;

  try {
    const localVersions = await listLocalDockerImages(request.repository);
    if (localVersions.length === 0) {
      return {
        status: "error",
        message: `Build a local ${request.repository} image before pushing.`,
      };
    }
    const registry = await getActiveZotRegistry();
    if (!registry) {
      return {
        status: "error",
        message:
          "Create and deploy a Zot service with an enabled domain on the active Dokploy instance before pushing.",
      };
    }
    for (const version of localVersions.filter((image) => !image.current)) {
      await pushDockerImage({
        localImage: `${version.name}:${version.tag}`,
        registryImage: `${registry.host}/${version.name}:${version.tag}`,
        registryHost: registry.host,
        username: registry.username,
        password: registry.password,
      });
    }
    const result = await pushDockerImage({
      localImage: request.image,
      registryImage: `${registry.host}/${request.image}`,
      registryHost: registry.host,
      username: registry.username,
      password: registry.password,
    });
    invalidateZotRegistryMemoryState(registry.host);
    return {
      status: "success",
      message: `Pushed ${result.image}.`,
      image: result.image,
    };
  } catch {
    return {
      status: "error",
      message: `Docker push failed for ${request.image}. Build it first and verify the Zot service is reachable.`,
    };
  }
}
