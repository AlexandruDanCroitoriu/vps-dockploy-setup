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
