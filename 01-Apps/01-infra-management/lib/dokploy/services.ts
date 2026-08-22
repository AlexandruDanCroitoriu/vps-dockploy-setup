import "server-only";

import { cache } from "react";
import { dokployGet, dokployPost } from "./client";
import { SERVICE_ENDPOINTS } from "./constants";
import {
  containersFromResponse,
  databaseCredentials,
  isContainerRunning,
  isRecord,
  serviceStatus,
  stringValue,
} from "./normalizers";
import { getDokployProject } from "./projects";
import type { DokployService, DokployServiceType } from "./types";

async function withServiceDetails(service: DokployService) {
  const endpoint = SERVICE_ENDPOINTS[service.type];
  const query = new URLSearchParams({ [endpoint.idParameter]: service.id });
  try {
    const payload = await dokployGet<unknown>(`${endpoint.path}.one?${query}`);
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
    };
  } catch {
    return service;
  }
}

export async function resolveDokployLiveStatus(
  service: DokployService,
  loadContainers: (endpoint: string) => Promise<unknown> = dokployGet,
) {
  if (service.status === "deploying" || !service.appName) return service;
  const query = new URLSearchParams({ appName: service.appName });
  if (service.serverId) query.set("serverId", service.serverId);
  try {
    const containers = containersFromResponse(
      await loadContainers(`docker.getContainersByAppNameMatch?${query}`),
    );
    return {
      ...service,
      status: containers.some(isContainerRunning)
        ? ("running" as const)
        : ("down" as const),
    };
  } catch {
    return service;
  }
}

export const getDokployServiceStatus = cache(async (service: DokployService) =>
  resolveDokployLiveStatus(await withServiceDetails(service)),
);

export const getDokployLiveServiceStatus = cache(
  async (service: DokployService) => resolveDokployLiveStatus(service),
);

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

export async function deployDokployService(
  type: DokployServiceType,
  serviceId: string,
) {
  const endpoint = SERVICE_ENDPOINTS[type];
  await dokployPost(`${endpoint.path}.deploy`, {
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
