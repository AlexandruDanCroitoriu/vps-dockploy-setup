"use server";

import { revalidatePath } from "next/cache";
import {
  createDokployProject,
  deployDokployService,
  getDokployProject,
  getDokployServiceStatus,
  hasDokployServiceContainer,
  reloadDokployService,
  removeDokployProject,
  stopDokployService,
  updateDokployProjectEnv,
  updateDokployProjectName,
} from "@/lib/dokploy";
import {
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "./shared";

export async function deleteProjectAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  if (!projectId)
    return { status: "error", message: "Invalid project identifier." };

  try {
    const project = await getDokployProject(projectId);
    if (!project) return { status: "error", message: "Project not found." };
    const serviceCount = project.environments.reduce(
      (count, environment) => count + environment.services.length,
      0,
    );
    if (serviceCount > 0) {
      return {
        status: "error",
        message: `Remove the project's ${serviceCount} services before deleting it.`,
      };
    }
    await removeDokployProject(projectId);
    revalidatePath("/projects");
    return { status: "success", message: "Project deleted." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to delete the project.",
      "the project deletion",
    );
  }
}

export async function setProjectServicesStateAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const requestedOperation = formData.get("operation")?.toString();
  if (
    !projectId ||
    (requestedOperation !== "deploy" &&
      requestedOperation !== "start" &&
      requestedOperation !== "stop")
  )
    return { status: "error", message: "Invalid project operation." };
  const operation = requestedOperation;

  try {
    const project = await getDokployProject(projectId);
    if (!project) return { status: "error", message: "Project not found." };
    const projectServices = project.environments.flatMap(
      (environment) => environment.services,
    );
    const resolvedServices =
      operation === "start"
        ? await Promise.all(
            projectServices.map((service) =>
              getDokployServiceStatus(service).catch(() => service),
            ),
          )
        : projectServices;
    const services = resolvedServices.filter((service) =>
      operation === "deploy"
        ? true
        : operation === "start"
          ? service.status !== "running"
          : service.status === "running",
    );
    const results = await Promise.allSettled(
      services.map(async (service) => {
        if (operation === "deploy") {
          await deployDokployService(service.type, service.id);
          return;
        }
        if (operation === "stop") {
          await stopDokployService(service.type, service.id);
          return;
        }
        if (await hasDokployServiceContainer(service)) {
          await reloadDokployService(
            service.type,
            service.id,
            service.appName ?? "",
          );
        } else {
          await deployDokployService(service.type, service.id);
        }
      }),
    );
    const failures = results.filter((result) => result.status === "rejected");
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    if (failures.length > 0) {
      return {
        status: "error",
        message:
          operation === "deploy"
            ? `${results.length - failures.length} of ${results.length} service deployments started.`
            : `${results.length - failures.length} of ${results.length} services ${operation === "start" ? "started" : "stopped"}.`,
      };
    }
    if (operation === "deploy") {
      return {
        status: "success",
        message:
          services.length === 0
            ? "The project has no services to deploy."
            : "All service deployments started.",
      };
    }
    return {
      status: "success",
      message:
        services.length === 0
          ? `All services are already ${operation === "start" ? "running" : "stopped"}.`
          : `All services ${operation === "start" ? "started" : "stopped"}.`,
    };
  } catch (error) {
    return getActionError(
      error,
      `Unable to ${operation} the project services.`,
      `the project ${operation}`,
    );
  }
}

export async function createProjectAction(
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  const name = formData.get("name")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  if (!name) return { status: "error", message: "Project name is required." };
  if (name.length > 255 || description.length > 1_000) {
    return { status: "error", message: "Project details are too long." };
  }

  try {
    await createDokployProject(name, description);
    revalidatePath("/projects");
    return { status: "success", message: "Project created." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to create the project.",
      "the project",
    );
  }
}

export async function updateProjectNameAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const name = formData.get("name")?.toString().trim() ?? "";
  if (!projectId || !name)
    return { status: "error", message: "Project name is required." };
  if (name.length > 255)
    return { status: "error", message: "Project name is too long." };

  try {
    await updateDokployProjectName(projectId, name);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { status: "success", message: "Project renamed." };
  } catch (error) {
    return getActionError(error, "Unable to rename the project.", "the rename");
  }
}

export async function updateProjectEnvAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const env = formData.get("env");
  if (!projectId || typeof env !== "string")
    return { status: "error", message: "Invalid environment variables." };
  if (env.length > 1_000_000)
    return { status: "error", message: "Environment file is too large." };

  try {
    await updateDokployProjectEnv(projectId, env);
    return { status: "success", message: "Environment variables saved." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to save environment variables.",
      "the update",
    );
  }
}
