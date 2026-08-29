import "server-only";

import { cache } from "react";
import {
  dokployGet,
  dokployGetFresh,
  dokployGetWithConfiguration,
  dokployPost,
  dokployPostWithConfiguration,
} from "./client";
import { DokployApiError } from "./errors";
import { isRecord, normalizeProject } from "./normalizers";
import type { DokployProject } from "./types";

async function loadDokployProjects(
  get: <T = unknown>(endpoint: string) => Promise<T>,
): Promise<DokployProject[]> {
  const payload = await get<unknown>("project.all");
  if (!Array.isArray(payload)) {
    throw new Error("Dokploy returned an unexpected projects response.");
  }
  const summaries = payload.flatMap((candidate) => {
    const project = normalizeProject(candidate);
    return project ? [project] : [];
  });
  return Promise.all(
    summaries.map(async (summary) => {
      try {
        const payload = await get<unknown>(
          `project.one?${new URLSearchParams({ projectId: summary.projectId })}`,
        );
        return (
          normalizeProject(
            isRecord(payload) && isRecord(payload.data)
              ? payload.data
              : payload,
          ) ?? summary
        );
      } catch {
        return summary;
      }
    }),
  );
}

export const getDokployProjects = cache(() => loadDokployProjects(dokployGet));

export function getFreshDokployProjects() {
  return loadDokployProjects(dokployGetFresh);
}

export function getDokployProjectsWithConfiguration(configuration: {
  baseUrl: string;
  apiKey: string;
}) {
  return loadDokployProjects((endpoint) =>
    dokployGetWithConfiguration(configuration, endpoint),
  );
}

async function fetchDokployProject(
  projectId: string,
  get: <T = unknown>(endpoint: string) => Promise<T>,
) {
  try {
    const payload = await get<unknown>(
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
  const projects = await loadDokployProjects(get);
  return projects.find((project) => project.projectId === projectId) ?? null;
}

export const getDokployProject = cache((projectId: string) =>
  fetchDokployProject(projectId, dokployGet),
);

export function getFreshDokployProject(projectId: string) {
  return fetchDokployProject(projectId, dokployGetFresh);
}

export async function updateDokployProjectEnv(projectId: string, env: string) {
  await dokployPost("project.update", { projectId, env });
}

export async function updateDokployProjectEnvWithConfiguration(
  configuration: { baseUrl: string; apiKey: string },
  projectId: string,
  env: string,
) {
  await dokployPostWithConfiguration(configuration, "project.update", {
    projectId,
    env,
  });
}

export function mergeDokployProjectEnv(
  current: string,
  entries: Readonly<Record<string, string>>,
) {
  const pending = new Map(Object.entries(entries));
  const managedKeys = new Set(pending.keys());
  const written = new Set<string>();
  const lines = current ? current.replaceAll("\r\n", "\n").split("\n") : [];
  const output = lines.flatMap((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[1];
    if (!key || !managedKeys.has(key)) return [line];
    if (written.has(key)) return [];
    written.add(key);
    const value = pending.get(key) ?? "";
    pending.delete(key);
    return [`${key}=${JSON.stringify(value)}`];
  });

  if (pending.size > 0 && output.some((line) => line.trim())) output.push("");
  for (const [key, value] of pending) {
    output.push(`${key}=${JSON.stringify(value)}`);
  }
  return output.join("\n");
}

export function removeDokployProjectEnvEntries(
  current: string,
  keys: ReadonlySet<string>,
) {
  return current
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => {
      const match = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/,
      );
      return !match || !keys.has(match[1]);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

export function parseDokployEnvironmentEntries(document: string) {
  const entries: Record<string, string> = {};
  for (const line of document.replaceAll("\r\n", "\n").split("\n")) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (!match) continue;
    const [, key, rawValue] = match;
    try {
      const parsed: unknown = JSON.parse(rawValue);
      entries[key] = typeof parsed === "string" ? parsed : rawValue;
    } catch {
      entries[key] = rawValue;
    }
  }
  return entries;
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

export async function removeDokployProject(projectId: string) {
  await dokployPost("project.remove", { projectId });
}
