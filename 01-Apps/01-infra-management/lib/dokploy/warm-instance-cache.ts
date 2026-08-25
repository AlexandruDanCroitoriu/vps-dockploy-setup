import "server-only";

import { getDokployDeployments } from "./deployments";
import { getDokployDomains } from "./domains";
import { getDokployGithubProviders } from "./applications";
import { getActiveDokployProjectSnapshot } from "./sidebar-project-snapshot";
import {
  getDokployDomainServiceNames,
  getDokployRunningContainerOptions,
  getDokployServiceStatus,
} from "./services";
import { getDokployRawComposeFile } from "./composes";

const WARM_CONCURRENCY = 4;

export async function warmActiveDokployInstanceCache() {
  const projects = await getActiveDokployProjectSnapshot();
  const services = projects.flatMap((project) =>
    project.environments.flatMap((environment) => environment.services),
  );
  const jobs: Array<() => Promise<unknown>> = [
    () => getDokployGithubProviders(),
  ];

  for (const service of services) {
    jobs.push(
      () => getDokployServiceStatus(service),
      () => getDokployDeployments(service),
      () => getDokployDomainServiceNames(service),
      () => getDokployRunningContainerOptions(service),
    );
    if (service.type === "applications" || service.type === "compose") {
      const domainType = service.type;
      jobs.push(() => getDokployDomains(domainType, service.id));
    }
    if (service.type === "compose") {
      jobs.push(() => getDokployRawComposeFile(service.id));
    }
  }

  let nextJob = 0;
  async function worker() {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob++];
      await job().catch(() => undefined);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(WARM_CONCURRENCY, jobs.length) }, worker),
  );
}
