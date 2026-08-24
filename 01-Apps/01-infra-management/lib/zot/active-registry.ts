import "server-only";

import {
  getActiveDokployConfiguration,
  getDokployDomains,
  getDokployProjects,
  isValidHostname,
} from "@/lib/dokploy";

export type ActiveZotRegistry = {
  host: string;
  username: string;
  password: string;
};

export async function getActiveZotRegistry(): Promise<ActiveZotRegistry | null> {
  const configuration = await getActiveDokployConfiguration();
  if (!configuration) return null;

  const projects = await getDokployProjects();
  const zot = projects
    .flatMap((project) => project.environments)
    .flatMap((environment) => environment.services)
    .find(
      (service) =>
        service.type === "compose" &&
        service.name.trim().toLowerCase() === "zot",
    );
  if (!zot) return null;

  const domains = await getDokployDomains("compose", zot.id);
  const domain =
    domains.find(
      (candidate) =>
        candidate.enabled &&
        candidate.https &&
        candidate.serviceName.toLowerCase() === "zot",
    ) ?? domains.find((candidate) => candidate.enabled && candidate.https);
  if (!domain || !isValidHostname(domain.host)) return null;

  return {
    host: domain.host,
    username: configuration.defaultServiceUsername,
    password: configuration.defaultServicePassword,
  };
}
