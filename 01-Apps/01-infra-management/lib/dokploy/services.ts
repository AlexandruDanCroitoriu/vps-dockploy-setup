import "server-only";

import { cache } from "react";
import {
  dokployGet,
  dokployGetFresh,
  dokployPost,
  dokployPostWithConfiguration,
} from "./client";
import { SERVICE_ENDPOINTS } from "./constants";
import {
  containersFromResponse,
  databaseCredentials,
  isContainerRunning,
  isRecord,
  serviceStatus,
  stringValue,
} from "./normalizers";
import { getDokployProject, getFreshDokployProject } from "./projects";
import type { DokployService, DokployServiceType } from "./types";

async function withServiceDetails(
  service: DokployService,
  get: (endpoint: string) => Promise<unknown> = dokployGet,
) {
  const endpoint = SERVICE_ENDPOINTS[service.type];
  const query = new URLSearchParams({ [endpoint.idParameter]: service.id });
  try {
    const payload = await get(`${endpoint.path}.one?${query}`);
    const details = isRecord(payload)
      ? isRecord(payload.data)
        ? payload.data
        : payload
      : null;
    if (!details) return service;
    return {
      ...service,
      name: stringValue(
        details.name,
        stringValue(details.databaseName, service.name),
      ),
      appName: stringValue(details.appName) || service.appName,
      env: stringValue(details.env, service.env),
      serverId: stringValue(details.serverId) || service.serverId,
      status: serviceStatus(details, service.type),
      credentials: databaseCredentials(
        details,
        service.type,
        service.appName ?? "",
      ),
      createdAt: stringValue(details.createdAt) || service.createdAt,
    };
  } catch {
    return service;
  }
}

export async function resolveDokployLiveStatus(
  service: DokployService,
  loadContainers: (endpoint: string) => Promise<unknown> = dokployGet,
) {
  if (service.status === "running") return service;
  if (!service.appName) return service;
  const query = new URLSearchParams({ appName: service.appName });
  if (service.type === "compose") query.set("appType", "docker-compose");
  if (service.serverId) query.set("serverId", service.serverId);
  try {
    let containers = containersFromResponse(
      await loadContainers(`docker.getContainersByAppNameMatch?${query}`),
    );
    if (service.type === "compose" && !containers.some(isContainerRunning)) {
      query.delete("appType");
      containers = containersFromResponse(
        await loadContainers(`docker.getContainersByAppNameMatch?${query}`),
      );
    }
    if (
      service.type === "applications" &&
      !containers.some(isContainerRunning)
    ) {
      containers = containersFromResponse(
        await loadContainers(
          `docker.getServiceContainersByAppName?${new URLSearchParams({
            appName: service.appName,
            ...(service.serverId ? { serverId: service.serverId } : {}),
          })}`,
        ),
      );
    }
    if (containers.some(isContainerRunning)) {
      return { ...service, status: "running" as const };
    }
    return service.status === "deploying"
      ? service
      : { ...service, status: "down" as const };
  } catch {
    return service;
  }
}

export const getDokployServiceStatus = cache(async (service: DokployService) =>
  resolveDokployLiveStatus(await withServiceDetails(service)),
);

export async function getFreshDokployServiceStatus(service: DokployService) {
  return resolveDokployLiveStatus(
    await withServiceDetails(service, dokployGetFresh),
    dokployGetFresh,
  );
}

export const getDokployLiveServiceStatus = cache(
  async (service: DokployService) => resolveDokployLiveStatus(service),
);

const NEW_SERVICE_STATUS_WINDOW_MS = 5 * 60 * 1000;

export function shouldPollDokployServiceStatus(
  service: DokployService,
  now = Date.now(),
) {
  if (service.status === "deploying") return true;
  if (service.status !== "down" || !service.createdAt) return false;
  const createdAt = Date.parse(service.createdAt);
  return (
    Number.isFinite(createdAt) &&
    now >= createdAt &&
    now - createdAt <= NEW_SERVICE_STATUS_WINDOW_MS
  );
}

export async function hasDokployServiceContainer(service: DokployService) {
  if (!service.appName) return false;
  const query = new URLSearchParams({ appName: service.appName });
  if (service.serverId) query.set("serverId", service.serverId);
  const containers = containersFromResponse(
    await dokployGet<unknown>(`docker.getContainersByAppNameMatch?${query}`),
  );
  return containers.length > 0;
}

export async function getDokployService(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
) {
  const project = await getDokployProject(projectId);
  if (!project) return null;
  return (
    project.environments
      .flatMap((environment) => environment.services)
      .find((service) => service.id === serviceId && service.type === type) ??
    null
  );
}

export async function getFreshDokployService(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
) {
  const project = await getFreshDokployProject(projectId);
  const service = project?.environments
    .flatMap((environment) => environment.services)
    .find((candidate) => candidate.id === serviceId && candidate.type === type);
  return service ? withServiceDetails(service, dokployGetFresh) : null;
}

export async function updateDokployServiceEnv(
  type: DokployServiceType,
  serviceId: string,
  env: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  await dokployPost(`${endpoint.path}.update`, {
    [endpoint.idParameter]: serviceId,
    env,
  });
}

export async function updateDokployServiceEnvWithConfiguration(
  configuration: { baseUrl: string; apiKey: string },
  type: DokployServiceType,
  serviceId: string,
  env: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  await dokployPostWithConfiguration(configuration, `${endpoint.path}.update`, {
    [endpoint.idParameter]: serviceId,
    env,
  });
}

export async function deployDokployService(
  type: DokployServiceType,
  serviceId: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  await dokployPost(`${endpoint.path}.deploy`, {
    [endpoint.idParameter]: serviceId,
  });
}

export async function deployDokployServiceWithConfiguration(
  configuration: { baseUrl: string; apiKey: string },
  type: DokployServiceType,
  serviceId: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  await dokployPostWithConfiguration(configuration, `${endpoint.path}.deploy`, {
    [endpoint.idParameter]: serviceId,
  });
}

export async function reloadDokployService(
  type: DokployServiceType,
  serviceId: string,
  appName: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  await dokployPost(
    `${endpoint.path}.${type === "compose" ? "redeploy" : "reload"}`,
    type === "compose"
      ? { [endpoint.idParameter]: serviceId }
      : { [endpoint.idParameter]: serviceId, appName },
  );
}

export async function stopDokployService(
  type: DokployServiceType,
  serviceId: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  await dokployPost(`${endpoint.path}.stop`, {
    [endpoint.idParameter]: serviceId,
  });
}

export async function startDokployService(
  type: DokployServiceType,
  serviceId: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  await dokployPost(`${endpoint.path}.start`, {
    [endpoint.idParameter]: serviceId,
  });
}

export async function removeDokployService(
  type: DokployServiceType,
  serviceId: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  const action =
    type === "applications"
      ? "delete"
      : type === "compose"
        ? "delete"
        : "remove";
  await dokployPost(`${endpoint.path}.${action}`, {
    [endpoint.idParameter]: serviceId,
    ...(type === "compose" ? { deleteVolumes: true } : {}),
  });
}

export async function getDokployDomainServiceNames(service: DokployService) {
  if (service.type === "applications")
    return [service.appName || service.name].filter(Boolean);
  if (service.type !== "compose") return [];
  const query = new URLSearchParams({ composeId: service.id, type: "fetch" });
  const payload = await dokployGet<unknown>(`compose.loadServices?${query}`);
  const candidates = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];
  return candidates.filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );
}

export async function getDokployRunningContainerOptions(
  service: DokployService,
) {
  if (service.type === "applications") {
    const name = service.appName || service.name;
    return name ? [{ value: name, label: name }] : [];
  }
  if (service.type !== "compose" || !service.appName) return [];
  const query = new URLSearchParams({ appName: service.appName });
  if (service.serverId) query.set("serverId", service.serverId);
  const containers = containersFromResponse(
    await dokployGet<unknown>(`docker.getContainersByAppNameMatch?${query}`),
  );
  const options = containers.flatMap((container) => {
    if (!isContainerRunning(container)) return [];
    const labels = isRecord(container.Labels)
      ? container.Labels
      : isRecord(container.labels)
        ? container.labels
        : {};
    const value = stringValue(
      labels["com.docker.compose.service"],
      stringValue(container.Service ?? container.service),
    );
    if (!value) return [];
    const names = Array.isArray(container.Names)
      ? container.Names.filter(
          (name): name is string => typeof name === "string",
        )
      : [];
    const label =
      names[0]?.replace(/^\//, "") ||
      stringValue(container.Name ?? container.name).replace(/^\//, "") ||
      value;
    return [{ value, label }];
  });
  return options.filter(
    (option, index) =>
      options.findIndex((candidate) => candidate.value === option.value) ===
      index,
  );
}
