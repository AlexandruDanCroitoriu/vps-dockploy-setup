"use server";

import { revalidatePath } from "next/cache";
import {
  createDokployGithubApplication,
  DOKPLOY_APPLICATION_BUILD_TYPES,
  generateDokployDomain,
  isValidHostname,
  isValidPort,
  type DokployApplicationBuildType,
} from "@/lib/dokploy";
import {
  deployAfterCreateRequested,
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  startInitialDeployment,
  type ActionState,
} from "./shared";

const APP_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const BRANCH_PATTERN = /^[a-zA-Z0-9._\-/#]+$/;
const REPOSITORY_PART_PATTERN = /^[a-zA-Z0-9._-]+$/;

function field(formData: FormData, name: string) {
  return formData.get(name)?.toString().trim() ?? "";
}

export async function generateApplicationDomainAction(applicationName: string) {
  if (!(await requireAuthenticatedSession())) {
    return { status: "error" as const, message: SESSION_EXPIRED_STATE.message };
  }

  const name = applicationName.trim();
  if (!APP_NAME_PATTERN.test(name) || name.length > 63) {
    return {
      status: "error" as const,
      message: "Enter a valid application name.",
    };
  }

  try {
    return {
      status: "success" as const,
      domain: await generateDokployDomain(name),
    };
  } catch (error) {
    const state = getActionError(
      error,
      "Unable to generate a domain.",
      "domain generation",
    );
    return { status: "error" as const, message: state.message };
  }
}

export async function createApplicationAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  const name = field(formData, "name");
  const description = field(formData, "description");
  const environmentId = field(formData, "environmentId");
  const githubId = field(formData, "githubId");
  const owner = field(formData, "owner");
  const repository = field(formData, "repository");
  const branch = field(formData, "branch");
  const buildPath = field(formData, "buildPath");
  const buildType = field(formData, "buildType") as DokployApplicationBuildType;
  const dockerfile = field(formData, "dockerfile");
  const dockerContextPath = field(formData, "dockerContextPath");
  const publishDirectory = field(formData, "publishDirectory");
  const host = field(formData, "host").toLowerCase();
  const port = Number(formData.get("port"));
  const watchPaths = field(formData, "watchPaths")
    .split(/[\r\n,]+/)
    .map((path) => path.trim())
    .filter(Boolean);
  const deployAfterCreate = deployAfterCreateRequested(formData);

  if (
    !projectId ||
    !name ||
    !environmentId ||
    !owner ||
    !repository ||
    !branch ||
    !buildPath ||
    !DOKPLOY_APPLICATION_BUILD_TYPES.includes(buildType)
  ) {
    return { status: "error", message: "Complete all required fields." };
  }
  if (host && (!isValidHostname(host) || !isValidPort(port))) {
    return { status: "error", message: "Enter a valid hostname and port." };
  }
  if (!APP_NAME_PATTERN.test(name) || name.length > 63) {
    return {
      status: "error",
      message:
        "Name must be 1–63 letters, numbers, dots, dashes, or underscores.",
    };
  }
  if (
    !REPOSITORY_PART_PATTERN.test(owner) ||
    !REPOSITORY_PART_PATTERN.test(repository) ||
    !BRANCH_PATTERN.test(branch)
  ) {
    return { status: "error", message: "Invalid repository or branch." };
  }
  if (
    description.length > 1_000 ||
    buildPath.length > 1_000 ||
    dockerfile.length > 1_000 ||
    dockerContextPath.length > 1_000 ||
    publishDirectory.length > 1_000 ||
    watchPaths.length > 50 ||
    watchPaths.some((path) => path.length > 1_000)
  ) {
    return { status: "error", message: "Application details are too long." };
  }

  try {
    const applicationId = await createDokployGithubApplication({
      name,
      description,
      environmentId,
      githubId: githubId || undefined,
      owner,
      repository,
      branch,
      buildPath,
      watchPaths,
      buildType,
      dockerfile,
      dockerContextPath,
      publishDirectory,
      isStaticSpa: formData.get("isStaticSpa") === "on",
      autoDeploy: formData.get("autoDeploy") === "on",
      ...(host
        ? {
            domain: {
              host,
              port,
              https: formData.get("https") === "on",
            },
          }
        : {}),
    });
    if (deployAfterCreate) {
      if (!(await startInitialDeployment("applications", applicationId))) {
        revalidatePath("/projects");
        revalidatePath(`/projects/${projectId}`);
        return {
          status: "error",
          message:
            "The application was created, but its first deployment could not be started.",
          createdService: { id: applicationId, type: "applications" },
        };
      }
    }
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return {
      status: "success",
      message: deployAfterCreate
        ? "Application created and deployment started."
        : "Application created.",
      createdService: { id: applicationId, type: "applications" },
    };
  } catch (error) {
    return getActionError(
      error,
      "Unable to create the application.",
      "the application setup",
    );
  }
}
