"use server";

import { revalidatePath } from "next/cache";

import {
  getComposeServiceDefinition,
  getUnavailableComposeServiceDefinitionIds,
  resolveComposeServiceEnvironment,
  resolveComposeServiceReferences,
} from "@/compose-services/registry";
import {
  createDokployRawCompose,
  getDokployProject,
  getDokployProjects,
  isValidHostname,
  mergeDatabaseCredentialsIntoProjectEnv,
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
  updateDokployProjectEnv,
} from "@/lib/dokploy";

import {
  deployAfterCreateRequested,
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  startInitialDeployment,
  type ActionState,
} from "./shared";

export async function createComposeAction(
  projectId: string,
  environmentId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  const definitionId = formData.get("definitionId")?.toString() ?? "";
  const host = formData.get("host")?.toString().trim().toLowerCase() ?? "";
  const loginUsername = formData.get("loginUsername")?.toString().trim() ?? "";
  const loginPassword = formData.get("loginPassword")?.toString() ?? "";
  const deployAfterCreate = deployAfterCreateRequested(formData);
  const definition = getComposeServiceDefinition(definitionId);
  const generateDomain = Boolean(
    definition?.domain?.generateByDefault && !host,
  );
  const project = projectId ? await getDokployProject(projectId) : null;
  const environment = project?.environments.find(
    (candidate) => candidate.environmentId === environmentId,
  );

  if (!projectId || !environmentId || !definition || !project || !environment)
    return { status: "error", message: "Invalid Compose service." };
  if ((host || generateDomain) && !definition.domain)
    return { status: "error", message: "This service has no domain target." };
  if (definition.domain?.required && !host)
    return {
      status: "error",
      message: `Enter the ${definition.name} domain hostname.`,
    };
  if (!generateDomain && host && !isValidHostname(host))
    return { status: "error", message: "Enter a valid domain hostname." };
  if (
    definition.requiresLoginCredentials &&
    (!loginUsername || !loginPassword)
  ) {
    return {
      status: "error",
      message: `Enter the ${definition.name} login credentials.`,
    };
  }
  if (loginUsername.length > 255 || loginPassword.length > 255)
    return { status: "error", message: "Login credentials are too long." };
  if (definition.id === "portainer" && loginPassword.length < 12) {
    return {
      status: "error",
      message:
        "Portainer requires an administrator password of at least 12 characters.",
    };
  }
  if (definition.maxPerInstance) {
    const projects = await getDokployProjects();
    if (
      getUnavailableComposeServiceDefinitionIds(projects).includes(
        definition.id,
      )
    ) {
      return {
        status: "error",
        message: `Only ${definition.maxPerInstance} ${definition.name} service is allowed per Dokploy instance.`,
      };
    }
  }
  const parameters = Object.fromEntries(
    (definition.parameterNames ?? []).map((name) => [
      name,
      formData.get(name)?.toString() ?? "",
    ]),
  );
  if (definition.parameterNames?.includes("garageCapacityGb")) {
    const capacityGb = Number(parameters.garageCapacityGb || 20);
    if (
      !Number.isSafeInteger(capacityGb) ||
      capacityGb < 1 ||
      capacityGb > 1_000_000
    ) {
      return {
        status: "error",
        message:
          "Garage capacity must be a whole number from 1 to 1,000,000 GB.",
      };
    }
    parameters.garageCapacityGb = String(capacityGb);
  }
  const environmentVariables = resolveComposeServiceEnvironment(definition, {
    services: environment.services,
    projectEnvironment: project.env,
    parameters,
    loginCredentials: definition.requiresLoginCredentials
      ? { username: loginUsername, password: loginPassword }
      : undefined,
  });
  const serviceEnvironmentVariables = resolveComposeServiceReferences(
    definition,
    {
      services: environment.services,
      projectEnvironment: project.env,
      parameters,
      loginCredentials: definition.requiresLoginCredentials
        ? { username: loginUsername, password: loginPassword }
        : undefined,
    },
  );
  if (
    !definition.name ||
    definition.name.length > 100 ||
    !definition.composeFile.trim() ||
    definition.composeFile.length > 1_000_000 ||
    environmentVariables.length > 1_000_000 ||
    serviceEnvironmentVariables.length > 1_000_000
  ) {
    return {
      status: "error",
      message: "The Compose service definition is invalid.",
    };
  }

  try {
    if (definition.environmentTarget === "project") {
      let projectEnvironment = mergeDatabaseCredentialsIntoProjectEnv(
        project.env,
        environment.services,
      );
      projectEnvironment = mergeDokployProjectEnv(
        projectEnvironment,
        parseDokployEnvironmentEntries(environmentVariables),
      );
      if (projectEnvironment !== project.env) {
        await updateDokployProjectEnv(projectId, projectEnvironment);
      }
    }
    const composeId = await createDokployRawCompose({
      name: definition.name,
      environmentId,
      composeFile: definition.composeFile,
      environmentVariables:
        definition.environmentTarget === "project"
          ? serviceEnvironmentVariables
          : environmentVariables,
      domain:
        (host || generateDomain) && definition.domain
          ? {
              host: generateDomain ? undefined : host,
              generate: generateDomain,
              serviceName: definition.domain.serviceName,
              port: definition.domain.port,
              https:
                definition.domain.httpsByDefault === true ||
                formData.get("https") === "on",
            }
          : undefined,
    });
    if (deployAfterCreate) {
      if (!(await startInitialDeployment("compose", composeId))) {
        revalidatePath("/projects");
        revalidatePath(`/projects/${projectId}`);
        return {
          status: "error",
          message:
            "The Compose service was created, but its first deployment could not be started.",
          createdService: { id: composeId, type: "compose" },
        };
      }
    }
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return {
      status: "success",
      message: deployAfterCreate
        ? "Compose service created and deployment started."
        : "Compose service created.",
      createdService: { id: composeId, type: "compose" },
    };
  } catch (error) {
    return getActionError(
      error,
      "Unable to create the Compose service.",
      "the Compose service",
    );
  }
}
