import "server-only";

import { cache } from "react";
import { dokployGet, dokployPost } from "./client";
import { DokployApiError } from "./errors";
import { isRecord, normalizeProject } from "./normalizers";
import type { DokployProject } from "./types";

export const getDokployProjects = cache(async (): Promise<DokployProject[]> => {
  const payload = await dokployGet<unknown>("project.all");
  if (!Array.isArray(payload)) {
    throw new Error("Dokploy returned an unexpected projects response.");
  }
  return payload.flatMap((candidate) => {
    const project = normalizeProject(candidate);
    return project ? [project] : [];
  });
});

export const getDokployProject = cache(async (projectId: string) => {
  try {
    const payload = await dokployGet<unknown>(
      `project.one?${new URLSearchParams({ projectId })}`,
    );
    const project = normalizeProject(
      isRecord(payload) && isRecord(payload.data) ? payload.data : payload,
    );
    if (project) return project;
  } catch (error) {
    if (
      !(error instanceof DokployApiError) ||
      ![400, 404, 405].includes(error.status)
    ) {
      throw error;
    }
  }
  const projects = await getDokployProjects();
  return projects.find((project) => project.projectId === projectId) ?? null;
});

export async function updateDokployProjectEnv(projectId: string, env: string) {
  await dokployPost("project.update", { projectId, env });
}

export async function createDokployProject(name: string, description?: string) {
  await dokployPost("project.create", {
    name,
    ...(description ? { description } : {}),
  });
}

export async function updateDokployProjectName(
  projectId: string,
  name: string,
) {
  await dokployPost("project.update", { projectId, name });
}
