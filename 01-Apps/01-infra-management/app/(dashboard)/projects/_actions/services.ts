"use server";

import { revalidatePath } from "next/cache";

import {
  getComposeServiceDefinitionByName,
  resolveComposeServiceEnvironment,
  resolveComposeServiceReferences,
} from "@/compose-services/registry";
import {
  configureDokployRawCompose,
  DOKPLOY_SERVICE_TYPES,
  deployDokployService,
  getDokployRawComposeFile,
  getDokployProject,
  mergeDatabaseCredentialsIntoProjectEnv,
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
  reloadDokployService,
  startDokployService,
  stopDokployService,
  updateDokployServiceEnv,
  updateDokployProjectEnv,
  type DokployServiceType,
} from "@/lib/dokploy";
import {
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "./shared";

async function synchronizeManagedCompose(projectId: string, serviceId: string) {
  const project = await getDokployProject(projectId);
  const environment = project?.environments.find((candidate) =>
    candidate.services.some(
      (service) => service.type === "compose" && service.id === serviceId,
    ),
  );
  const service = environment?.services.find(
    (candidate) => candidate.type === "compose" && candidate.id === serviceId,
  );
  const definition = service
    ? getComposeServiceDefinitionByName(service.name)
    : undefined;
  if (!environment || !definition) return;

  const environmentVariables = resolveComposeServiceEnvironment(definition, {
    services: environment.services,
    projectEnvironment: project?.env ?? "",
  });
  const serviceEnvironmentVariables = resolveComposeServiceReferences(
    definition,
    {
      services: environment.services,
      projectEnvironment: project?.env ?? "",
    },
  );
  if (definition.environmentTarget === "project") {
    let projectEnvironment = mergeDatabaseCredentialsIntoProjectEnv(
      project?.env ?? "",
      environment.services,
    );
    projectEnvironment = mergeDokployProjectEnv(
      projectEnvironment,
      parseDokployEnvironmentEntries(environmentVariables),
    );
    if (project && projectEnvironment !== project.env) {
      await updateDokployProjectEnv(projectId, projectEnvironment);
    }
  }
  await updateDokployServiceEnv(
    "compose",
    serviceId,
    definition.environmentTarget === "project"
      ? serviceEnvironmentVariables
      : environmentVariables,
  );
}

export async function updateServiceEnvAction(
  type: DokployServiceType,
  serviceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const env = formData.get("env");
  if (
    !DOKPLOY_SERVICE_TYPES.includes(type) ||
    !serviceId ||
    typeof env !== "string"
  )
    return { status: "error", message: "Invalid environment variables." };
  if (env.length > 1_000_000)
    return { status: "error", message: "Environment file is too large." };
  try {
    await updateDokployServiceEnv(type, serviceId, env);
    return { status: "success", message: "Service variables saved." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to save service variables.",
      "the update",
    );
  }
}

export async function updateRawComposeFileAction(
  composeId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const composeFile = formData.get("composeFile");
  if (
    !composeId ||
    typeof composeFile !== "string" ||
    !composeFile.trim() ||
    composeFile.length > 1_000_000
  ) {
    return { status: "error", message: "Invalid Compose file." };
  }
  try {
    const currentFile = await getDokployRawComposeFile(composeId);
    if (currentFile === null) {
      return {
        status: "error",
        message: "Only raw Compose services can be edited here.",
      };
    }
    await configureDokployRawCompose(composeId, composeFile);
    return { status: "success", message: "Compose file saved." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to save the Compose file.",
      "the update",
    );
  }
}

export async function reloadServiceAction(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
  appName: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (
    !projectId ||
    !DOKPLOY_SERVICE_TYPES.includes(type) ||
    !serviceId ||
    !/^[a-zA-Z0-9._-]{1,63}$/.test(appName)
  )
    return { status: "error", message: "Invalid service." };
  try {
    await reloadDokployService(type, serviceId, appName);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Service reloaded." };
  } catch (error) {
    return getActionError(error, "Unable to reload the service.", "the reload");
  }
}

export async function stopServiceAction(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (!projectId || !DOKPLOY_SERVICE_TYPES.includes(type) || !serviceId)
    return { status: "error", message: "Invalid service." };
  try {
    await stopDokployService(type, serviceId);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Service stopped." };
  } catch (error) {
    return getActionError(error, "Unable to stop the service.", "the stop");
  }
}

export async function startServiceAction(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (!projectId || !DOKPLOY_SERVICE_TYPES.includes(type) || !serviceId)
    return { status: "error", message: "Invalid service." };
  try {
    await startDokployService(type, serviceId);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Service started." };
  } catch (error) {
    return getActionError(error, "Unable to start the service.", "the start");
  }
}

export async function deployServiceAction(
  projectId: string,
  type: DokployServiceType,
  serviceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (!projectId || !DOKPLOY_SERVICE_TYPES.includes(type) || !serviceId)
    return { status: "error", message: "Invalid service." };
  try {
    if (type === "compose") {
      await synchronizeManagedCompose(projectId, serviceId);
    }
    await deployDokployService(type, serviceId);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Deployment started." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to start the deployment.",
      "the deployment",
    );
  }
}
