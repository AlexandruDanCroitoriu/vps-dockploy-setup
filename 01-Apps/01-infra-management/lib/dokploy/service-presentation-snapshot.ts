import "server-only";

import { getActiveDokployInstanceSummary } from "./active-instance";
import { getDokployDomains } from "./domains";
import { getDokployRenderSnapshot } from "./render-snapshot-cache";
import { getDokployServiceStatus } from "./services";
import type { DokployDomain, DokployService } from "./types";

export type ServicePresentationSnapshot = {
  services: DokployService[];
  domains: DokployDomain[][];
};

export async function getServicePresentationSnapshot(
  projectId: string,
  services: DokployService[],
): Promise<ServicePresentationSnapshot> {
  const instance = await getActiveDokployInstanceSummary();
  if (!instance) return { services, domains: services.map(() => []) };
  const serviceVersion = services
    .map((service) => `${service.type}:${service.id}:${service.status}`)
    .join("|");

  return getDokployRenderSnapshot(
    instance.id,
    `project-services:${projectId}:${serviceVersion}`,
    async () => {
      const [statusResults, domainResults] = await Promise.all([
        Promise.allSettled(services.map(getDokployServiceStatus)),
        Promise.allSettled(
          services.map((service) =>
            service.type === "applications" || service.type === "compose"
              ? getDokployDomains(service.type, service.id)
              : Promise.resolve([]),
          ),
        ),
      ]);
      return {
        services: services.map((service, index) =>
          statusResults[index].status === "fulfilled"
            ? statusResults[index].value
            : service,
        ),
        domains: services.map((_, index) =>
          domainResults[index].status === "fulfilled"
            ? domainResults[index].value
            : [],
        ),
      };
    },
  );
}
