import "server-only";

import { dokployGet, dokployPost } from "./client";
import { createDokployDomain } from "./domains";
import { isRecord, stringValue, unwrapArray } from "./normalizers";

export const DOKPLOY_APPLICATION_BUILD_TYPES = [
  "dockerfile",
  "nixpacks",
  "railpack",
  "static",
] as const;

export type DokployApplicationBuildType =
  (typeof DOKPLOY_APPLICATION_BUILD_TYPES)[number];

export type DokployGithubProvider = {
  githubId: string;
  name: string;
};

export type CreateDokployGithubApplicationInput = {
  name: string;
  description?: string;
  environmentId: string;
  githubId?: string;
  owner: string;
  repository: string;
  branch: string;
  buildPath: string;
  watchPaths: string[];
  buildType: DokployApplicationBuildType;
  dockerfile?: string;
  dockerContextPath?: string;
  publishDirectory?: string;
  isStaticSpa?: boolean;
  autoDeploy: boolean;
  environmentVariables?: string;
  domain?: {
    host: string;
    port: number;
    https: boolean;
  };
};

export type CreateDokployDockerApplicationInput = {
  name: string;
  description?: string;
  environmentId: string;
  image: string;
  registryUrl: string;
  registryUsername: string;
  registryPassword: string;
  environmentVariables?: string;
  mounts?: Array<
    | { type: "bind"; hostPath: string; mountPath: string }
    | { type: "volume"; volumeName: string; mountPath: string }
  >;
  domain?: {
    host: string;
    port: number;
    https: boolean;
  };
};

export async function getDokployGithubProviders(): Promise<
  DokployGithubProvider[]
> {
  const payload = await dokployGet<unknown>("github.githubProviders");
  return unwrapArray(payload, "data", "providers").flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const githubId = stringValue(candidate.githubId);
    if (!githubId) return [];
    return [
      {
        githubId,
        name: stringValue(
          candidate.name,
          stringValue(candidate.githubAppName, "GitHub"),
        ),
      },
    ];
  });
}

function applicationIdFromPayload(payload: unknown) {
  const candidate =
    isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  return isRecord(candidate) ? stringValue(candidate.applicationId) : "";
}

export async function createDokployDockerApplication(
  input: CreateDokployDockerApplicationInput,
) {
  const created = await dokployPost<unknown>("application.create", {
    name: input.name,
    appName: input.name,
    ...(input.description ? { description: input.description } : {}),
    environmentId: input.environmentId,
    sourceType: "docker",
  });
  const applicationId = applicationIdFromPayload(created);
  if (!applicationId) {
    throw new Error("Dokploy did not return the new application ID.");
  }

  try {
    await dokployPost("application.saveDockerProvider", {
      applicationId,
      dockerImage: input.image,
      registryUrl: input.registryUrl,
      username: input.registryUsername,
      password: input.registryPassword,
    });
    if (input.environmentVariables) {
      await dokployPost("application.saveEnvironment", {
        applicationId,
        env: input.environmentVariables,
        buildArgs: null,
        buildSecrets: null,
        createEnvFile: false,
      });
    }
    for (const mount of input.mounts ?? []) {
      await dokployPost("mounts.create", {
        serviceType: "application",
        serviceId: applicationId,
        type: mount.type,
        mountPath: mount.mountPath,
        ...(mount.type === "bind"
          ? { hostPath: mount.hostPath }
          : { volumeName: mount.volumeName }),
      });
    }
    if (input.domain) {
      await createDokployDomain({
        type: "applications",
        serviceId: applicationId,
        serviceName: input.name,
        host: input.domain.host,
        port: input.domain.port,
        https: input.domain.https,
        letsEncrypt: input.domain.https,
      });
    }
    return applicationId;
  } catch (error) {
    await dokployPost("application.delete", { applicationId }).catch(() => {});
    throw error;
  }
}

export async function createDokployGithubApplication(
  input: CreateDokployGithubApplicationInput,
) {
  const created = await dokployPost<unknown>("application.create", {
    name: input.name,
    appName: input.name,
    ...(input.description ? { description: input.description } : {}),
    environmentId: input.environmentId,
    sourceType: input.githubId ? "github" : "git",
  });
  const applicationId = applicationIdFromPayload(created);
  if (!applicationId) {
    throw new Error("Dokploy did not return the new application ID.");
  }

  try {
    if (input.githubId) {
      await dokployPost("application.saveGithubProvider", {
        applicationId,
        repository: input.repository,
        owner: input.owner,
        buildPath: input.buildPath,
        githubId: input.githubId,
        branch: input.branch,
        triggerType: "push",
        watchPaths: input.watchPaths,
      });
    } else {
      await dokployPost("application.saveGitProvider", {
        applicationId,
        customGitUrl: `https://github.com/${input.owner}/${input.repository}.git`,
        customGitBranch: input.branch,
        customGitBuildPath: input.buildPath,
        watchPaths: input.watchPaths,
      });
    }
    await dokployPost("application.saveBuildType", {
      applicationId,
      buildType: input.buildType,
      dockerfile: null,
      dockerContextPath: null,
      dockerBuildStage: null,
      herokuVersion: null,
      railpackVersion: null,
      publishDirectory: null,
      isStaticSpa: null,
      ...(input.buildType === "dockerfile"
        ? {
            dockerfile: input.dockerfile || "Dockerfile",
            dockerContextPath: input.dockerContextPath || ".",
          }
        : {}),
      ...(input.buildType === "static"
        ? {
            publishDirectory: input.publishDirectory || "dist",
            isStaticSpa: input.isStaticSpa ?? true,
          }
        : {}),
    });
    await dokployPost("application.update", {
      applicationId,
      autoDeploy: input.autoDeploy,
      watchPaths: input.watchPaths,
    });
    if (input.environmentVariables) {
      await dokployPost("application.saveEnvironment", {
        applicationId,
        env: input.environmentVariables,
        buildArgs: null,
        buildSecrets: null,
        createEnvFile: false,
      });
    }
    if (input.domain) {
      await createDokployDomain({
        type: "applications",
        serviceId: applicationId,
        serviceName: input.name,
        host: input.domain.host,
        port: input.domain.port,
        https: input.domain.https,
        letsEncrypt: input.domain.https,
      });
    }
    return applicationId;
  } catch (error) {
    await dokployPost("application.delete", { applicationId }).catch(() => {});
    throw error;
  }
}
