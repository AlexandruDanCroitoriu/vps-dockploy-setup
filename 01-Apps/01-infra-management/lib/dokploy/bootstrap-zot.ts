import "server-only";

import { zotService } from "@/compose-services/zot";
import {
  dokployGetWithConfiguration,
  dokployPostWithConfiguration,
} from "./client";
import { isRecord, normalizeProject, stringValue } from "./normalizers";
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

function containsZot(projects: readonly DokployProject[]) {
  return projects.some((project) =>
    project.environments.some((environment) =>
      environment.services.some(
        (service) =>
          service.type === "compose" &&
          service.name.trim().toLowerCase() === "zot",
      ),
    ),
  );
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

export async function ensureDokployZotRegistry(input: {
  configuration: DokployConfiguration;
  rootDomain: string;
  username: string;
  password: string;
}) {
  const projects = await loadProjects(input.configuration);
  if (containsZot(projects)) return { created: false } as const;

  let mainProject = projects.find(
    (project) => project.name.trim().toLowerCase() === "main",
  );
  let environmentId = mainProject?.environments.find(
    (environment) => environment.name.trim().toLowerCase() === "production",
  )?.environmentId ?? mainProject?.environments[0]?.environmentId ?? "";
  const projectCreated = !mainProject;

  if (!mainProject) {
    const created = await dokployPostWithConfiguration<unknown>(
      input.configuration,
      "project.create",
      { name: "main" },
    );
    const ids = createdProjectIds(created);
    if (!ids.projectId || !ids.environmentId) {
      throw new Error("Dokploy did not return the new main project environment.");
    }
    mainProject = {
      projectId: ids.projectId,
      name: "main",
      description: null,
      createdAt: "",
      env: "",
      environments: [],
    };
    environmentId = ids.environmentId;
  }
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
  if (!composeId) throw new Error("Dokploy did not return the new Zot Compose ID.");

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
  } catch (error) {
    await dokployPostWithConfiguration(
      input.configuration,
      "compose.delete",
      { composeId, deleteVolumes: false },
    ).catch(() => {});
    throw error;
  }

  return {
    created: true,
    projectCreated,
    projectId: mainProject.projectId,
    composeId,
  } as const;
}
