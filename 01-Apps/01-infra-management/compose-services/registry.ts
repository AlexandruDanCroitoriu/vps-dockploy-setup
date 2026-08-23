import "server-only";

import type { DokployService } from "@/lib/dokploy";

import { dbGateService } from "./dbgate";

export type ComposeServiceDefinitionContext = Readonly<{
  services: readonly DokployService[];
  projectEnvironment: string;
  loginCredentials?: Readonly<{ username: string; password: string }>;
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

export const composeServiceOptions = composeServiceDefinitions.map(
  ({ id, name, description, domain, requiresLoginCredentials }) => ({
    id,
    name,
    description,
    supportsDomain: Boolean(domain),
    automaticDomain: domain?.generateByDefault === true,
    httpsByDefault: domain?.httpsByDefault === true,
    domainRequired: domain?.required === true,
    defaultDomainSubdomain: domain?.defaultSubdomain,
    requiresLoginCredentials: requiresLoginCredentials === true,
  }),
);
