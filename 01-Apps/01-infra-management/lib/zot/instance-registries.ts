import "server-only";

import { dokployGetWithConfiguration } from "@/lib/dokploy/client";
import {
  isRecord,
  normalizeDomains,
  normalizeProject,
} from "@/lib/dokploy/normalizers";
import {
  getDokployInstance,
  listDokployInstances,
} from "@/lib/storage/dokploy-instances";
import { isValidHostname } from "@/lib/dokploy/validators";
import type { ActiveZotRegistry } from "./active-registry";

export type InstanceZotRegistry = {
  instanceId: string;
  instanceName: string;
  registry: ActiveZotRegistry | null;
};

async function resolveInstanceRegistry(
  instanceId: string,
): Promise<InstanceZotRegistry | null> {
  const instance = getDokployInstance(instanceId);
  if (!instance) return null;
  const configuration = { baseUrl: instance.rootUrl, apiKey: instance.apiKey };
  const payload = await dokployGetWithConfiguration<unknown>(
    configuration,
    "project.all",
  );
  if (!Array.isArray(payload)) return null;

  const summaries = payload.flatMap((candidate) => {
    const project = normalizeProject(candidate);
    return project ? [project] : [];
  });
  for (const summary of summaries) {
    const detailsPayload = await dokployGetWithConfiguration<unknown>(
      configuration,
      `project.one?${new URLSearchParams({ projectId: summary.projectId })}`,
    );
    const details = normalizeProject(
      isRecord(detailsPayload) && isRecord(detailsPayload.data)
        ? detailsPayload.data
        : detailsPayload,
    );
    const zot = (details ?? summary).environments
      .flatMap((environment) => environment.services)
      .find(
        (service) =>
          service.type === "compose" &&
          service.name.trim().toLowerCase() === "zot",
      );
    if (!zot) continue;

    const domains = normalizeDomains(
      await dokployGetWithConfiguration<unknown>(
        configuration,
        `domain.byComposeId?${new URLSearchParams({ composeId: zot.id })}`,
      ),
    );
    const domain =
      domains.find(
        (candidate) =>
          candidate.enabled &&
          candidate.https &&
          candidate.serviceName.toLowerCase() === "zot",
      ) ?? domains.find((candidate) => candidate.enabled && candidate.https);
    if (!domain || !isValidHostname(domain.host)) break;
    return {
      instanceId: instance.id,
      instanceName: instance.name,
      registry: {
        host: domain.host,
        username: instance.defaultServiceUsername,
        password: instance.defaultServicePassword,
      },
    };
  }
  return {
    instanceId: instance.id,
    instanceName: instance.name,
    registry: null,
  };
}

export async function getInstanceZotRegistries() {
  return Promise.all(
    listDokployInstances().map(async (instance) => {
      try {
        return (
          (await resolveInstanceRegistry(instance.id)) ?? {
            instanceId: instance.id,
            instanceName: instance.name,
            registry: null,
          }
        );
      } catch {
        return {
          instanceId: instance.id,
          instanceName: instance.name,
          registry: null,
        };
      }
    }),
  );
}

export async function getInstanceZotRegistry(instanceId: string) {
  return (await resolveInstanceRegistry(instanceId))?.registry ?? null;
}
