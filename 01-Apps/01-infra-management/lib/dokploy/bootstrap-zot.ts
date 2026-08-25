import "server-only";

import { zotService } from "@/compose-services/zot";
import {
  dokployGetWithConfiguration,
  dokployPostWithConfiguration,
} from "./client";
import {
  containersFromResponse,
  isContainerRunning,
  isRecord,
  normalizeProject,
  serviceStatus,
  stringValue,
} from "./normalizers";
import type { DokployProject } from "./types";

type DokployConfiguration = { baseUrl: string; apiKey: string };

function unwrapData(payload: unknown) {
  return isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
}

async function loadProjects(configuration: DokployConfiguration) {
  const payload = await dokployGetWithConfiguration<unknown>(
    configuration,
    "project.all",
  );
  if (!Array.isArray(payload)) {
    throw new Error("Dokploy returned an unexpected projects response.");
  }
  const summaries = payload.flatMap((candidate): DokployProject[] => {
    const project = normalizeProject(candidate);
    return project ? [project] : [];
  });
  return Promise.all(
    summaries.map(async (summary) => {
      const details = await dokployGetWithConfiguration<unknown>(
        configuration,
        `project.one?${new URLSearchParams({ projectId: summary.projectId })}`,
      );
      return normalizeProject(unwrapData(details)) ?? summary;
    }),
  );
}

function findZot(projects: readonly DokployProject[]) {
  for (const project of projects) {
    for (const environment of project.environments) {
      const zot = environment.services.find(
        (service) =>
          service.type === "compose" &&
          service.name.trim().toLowerCase() === "zot",
      );
      if (zot) return zot;
    }
  }
  return null;
}

function createdProjectIds(payload: unknown) {
  const candidate = unwrapData(payload);
  if (!isRecord(candidate)) return { projectId: "", environmentId: "" };
  const project = isRecord(candidate.project) ? candidate.project : candidate;
  const environment = isRecord(candidate.environment)
    ? candidate.environment
    : null;
  return {
    projectId: stringValue(project.projectId),
    environmentId: stringValue(environment?.environmentId),
  };
}

function createdComposeId(payload: unknown) {
  const candidate = unwrapData(payload);
  return isRecord(candidate) ? stringValue(candidate.composeId) : "";
}

type ZotBootstrapInput = {
  configuration: DokployConfiguration;
  rootDomain: string;
  username: string;
  password: string;
  onStatus?: (message: string) => void;
};

async function waitForZotRunning(input: ZotBootstrapInput, composeId: string) {
  const deadline = Date.now() + 10 * 60 * 1_000;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const payload = await dokployGetWithConfiguration<unknown>(
        input.configuration,
        `compose.one?${new URLSearchParams({ composeId })}`,
      );
      const details = unwrapData(payload);
      if (isRecord(details)) {
        if (serviceStatus(details, "compose") === "running") return;
        const appName = stringValue(details.appName);
        if (appName) {
          const query = new URLSearchParams({
            appName,
            appType: "docker-compose",
          });
          const serverId = stringValue(details.serverId);
          if (serverId) query.set("serverId", serverId);
          const containers = containersFromResponse(
            await dokployGetWithConfiguration<unknown>(
              input.configuration,
              `docker.getContainersByAppNameMatch?${query}`,
            ),
          );
          if (containers.some(isContainerRunning)) return;
        }
      }
    } catch {
      input.onStatus?.(
        `Dokploy status check ${attempt} was unavailable; retrying.`,
      );
    }
    input.onStatus?.(`Waiting for Zot to start (attempt ${attempt}).`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Zot did not reach a running state within 10 minutes.");
}

export async function ensureDokployMainProject(
  configuration: DokployConfiguration,
) {
  const projects = await loadProjects(configuration);
  const mainProject = projects.find(
    (project) => project.name.trim().toLowerCase() === "main",
  );
  if (mainProject)
    return { created: false, projectId: mainProject.projectId } as const;

  const created = await dokployPostWithConfiguration<unknown>(
    configuration,
    "project.create",
    { name: "main" },
  );
  const ids = createdProjectIds(created);
  if (!ids.projectId || !ids.environmentId) {
    throw new Error("Dokploy did not return the new main project environment.");
  }
  return { created: true, projectId: ids.projectId } as const;
}

export async function deployDokployZotRegistry(input: ZotBootstrapInput) {
  const projects = await loadProjects(input.configuration);
  const existingZot = findZot(projects);
  if (existingZot) {
    await waitForZotRunning(input, existingZot.id);
    return { created: false } as const;
  }

  const mainProject = projects.find(
    (project) => project.name.trim().toLowerCase() === "main",
  );
  if (!mainProject) {
    throw new Error("Create the main project before deploying Zot.");
  }
  const environmentId =
    mainProject.environments.find(
      (environment) => environment.name.trim().toLowerCase() === "production",
    )?.environmentId ??
    mainProject.environments[0]?.environmentId ??
    "";
  if (!environmentId) {
    throw new Error("The main project has no environment for Zot.");
  }

  const environmentVariables = zotService.environmentVariables({
    services: [],
    projectEnvironment: mainProject.env,
    loginCredentials: { username: input.username, password: input.password },
  });
  const created = await dokployPostWithConfiguration<unknown>(
    input.configuration,
    "compose.create",
    {
      name: zotService.name,
      environmentId,
      composeType: "docker-compose",
      sourceType: "raw",
      composeFile: zotService.composeFile,
    },
  );
  const composeId = createdComposeId(created);
  if (!composeId)
    throw new Error("Dokploy did not return the new Zot Compose ID.");

  let deploymentQueued = false;
  try {
    await dokployPostWithConfiguration(input.configuration, "compose.update", {
      composeId,
      sourceType: "raw",
      composeType: "docker-compose",
      composeFile: zotService.composeFile,
    });
    await dokployPostWithConfiguration(
      input.configuration,
      "compose.saveEnvironment",
      { composeId, env: environmentVariables },
    );
    await dokployPostWithConfiguration(input.configuration, "domain.create", {
      host: `zot.${input.rootDomain}`,
      port: 5000,
      https: true,
      certificateType: "letsencrypt",
      domainType: "compose",
      composeId,
      serviceName: "zot",
    });
    await dokployPostWithConfiguration(input.configuration, "compose.deploy", {
      composeId,
    });
    deploymentQueued = true;
    input.onStatus?.("Zot deployment queued; waiting for the service to run.");
    await waitForZotRunning(input, composeId);
  } catch (error) {
    if (!deploymentQueued) {
      await dokployPostWithConfiguration(
        input.configuration,
        "compose.delete",
        { composeId, deleteVolumes: false },
      ).catch(() => {});
    }
    throw error;
  }

  return {
    created: true,
    projectId: mainProject.projectId,
    composeId,
  } as const;
}
