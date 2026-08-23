import "server-only";

import {
  parseDokployEnvironmentEntries,
  type DokployProject,
  type DokployService,
} from "@/lib/dokploy";

import { dbGateService } from "./dbgate";
import { garageService } from "./garage";
import { portainerService } from "./portainer";
import { zotService } from "./zot";

export type ComposeServiceDefinitionContext = Readonly<{
  services: readonly DokployService[];
  projectEnvironment: string;
  loginCredentials?: Readonly<{ username: string; password: string }>;
  parameters?: Readonly<Record<string, string>>;
}>;

export type ComposeServiceDefinition = Readonly<{
  id: string;
  name: string;
  description: string;
  composeFile: string;
  environmentVariables:
    string | ((context: ComposeServiceDefinitionContext) => string);
  serviceEnvironmentVariables?:
    string | ((context: ComposeServiceDefinitionContext) => string);
  environmentTarget?: "service" | "project";
  requiresLoginCredentials?: boolean;
  maxPerInstance?: number;
  parameterNames?: readonly string[];
  domain?: Readonly<{
    serviceName: string;
    defaultSubdomain?: string;
    port: number;
    generateByDefault?: boolean;
    httpsByDefault?: boolean;
    required?: boolean;
  }>;
}>;

// Import definitions from this folder and add them to this array.
// Keep passwords, tokens, and other secrets out of repository-backed definitions.
export const composeServiceDefinitions: readonly ComposeServiceDefinition[] = [
  dbGateService,
  garageService,
  portainerService,
  zotService,
];

export function getComposeServiceDefinition(id: string) {
  return composeServiceDefinitions.find((definition) => definition.id === id);
}

export function getComposeServiceDefinitionByName(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return composeServiceDefinitions.find(
    (definition) => definition.name.toLowerCase() === normalizedName,
  );
}

export function getUnavailableComposeServiceDefinitionIds(
  projects: readonly DokployProject[],
) {
  return composeServiceDefinitions.flatMap((definition) => {
    if (!definition.maxPerInstance) return [];
    const count = projects.reduce(
      (projectCount, project) =>
        projectCount +
        project.environments.reduce(
          (environmentCount, environment) =>
            environmentCount +
            environment.services.filter(
              (service) =>
                service.type === "compose" &&
                service.name.trim().toLowerCase() ===
                  definition.name.trim().toLowerCase(),
            ).length,
          0,
        ),
      0,
    );
    return count >= definition.maxPerInstance ? [definition.id] : [];
  });
}

export function resolveComposeServiceEnvironment(
  definition: ComposeServiceDefinition,
  context: ComposeServiceDefinitionContext,
) {
  return typeof definition.environmentVariables === "function"
    ? definition.environmentVariables(context)
    : definition.environmentVariables;
}

export function resolveComposeServiceReferences(
  definition: ComposeServiceDefinition,
  context: ComposeServiceDefinitionContext,
) {
  const references = definition.serviceEnvironmentVariables;
  if (!references) return "";
  return typeof references === "function" ? references(context) : references;
}

export function resolveComposeProjectEnvironmentKeys(
  definition: ComposeServiceDefinition,
  context: ComposeServiceDefinitionContext,
) {
  if (definition.environmentTarget !== "project") return new Set<string>();
  return new Set(
    Object.keys(
      parseDokployEnvironmentEntries(
        resolveComposeServiceEnvironment(definition, context),
      ),
    ),
  );
}

export const composeServiceOptions = composeServiceDefinitions.map(
  ({
    id,
    name,
    description,
    domain,
    requiresLoginCredentials,
    parameterNames,
  }) => ({
    id,
    name,
    description,
    supportsDomain: Boolean(domain),
    automaticDomain: domain?.generateByDefault === true,
    httpsByDefault: domain?.httpsByDefault === true,
    domainRequired: domain?.required === true,
    defaultDomainSubdomain: domain?.defaultSubdomain,
    requiresLoginCredentials: requiresLoginCredentials === true,
    supportsGarageCapacity:
      parameterNames?.includes("garageCapacityGb") === true,
  }),
);
