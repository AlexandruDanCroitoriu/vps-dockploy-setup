"use server";

import { revalidatePath } from "next/cache";

import {
  getComposeServiceDefinition,
  resolveComposeServiceEnvironment,
  resolveComposeServiceReferences,
} from "@/compose-services/registry";
import {
  createDokployRawCompose,
  getDokployProject,
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
    return { status: "error", message: "Enter the DBGate domain hostname." };
  if (!generateDomain && host && !isValidHostname(host))
    return { status: "error", message: "Enter a valid domain hostname." };
  if (
    definition.requiresLoginCredentials &&
    (!loginUsername || !loginPassword)
  ) {
    return { status: "error", message: "Enter the DBGate login credentials." };
  }
  if (loginUsername.length > 255 || loginPassword.length > 255)
    return { status: "error", message: "Login credentials are too long." };
  const environmentVariables = resolveComposeServiceEnvironment(definition, {
    services: environment.services,
    projectEnvironment: project.env,
    loginCredentials: definition.requiresLoginCredentials
      ? { username: loginUsername, password: loginPassword }
      : undefined,
  });
  const serviceEnvironmentVariables = resolveComposeServiceReferences(
    definition,
    {
      services: environment.services,
      projectEnvironment: project.env,
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
    };
  } catch (error) {
    return getActionError(
      error,
      "Unable to create the Compose service.",
      "the Compose service",
    );
  }
}
