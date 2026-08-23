export const PROJECTS_CHANGED_EVENT = "dokploy-projects-changed";
export const PROJECT_SERVICE_CREATION_EVENT =
  "dokploy-project-service-creation";
export const PROJECT_SERVICE_DELETED_EVENT = "dokploy-project-service-deleted";

export type PendingProjectService = {
  requestId: string;
  projectId: string;
  matchName: string;
  displayName: string;
  typeLabel: string;
  serviceType: string;
  serviceId?: string;
};

export type ProjectServiceCreationDetail =
  | { phase: "started"; service: PendingProjectService }
  | {
      phase: "completed";
      requestId: string;
      projectId: string;
      serviceId: string;
    }
  | { phase: "failed"; requestId: string; projectId: string };

export function notifyProjectsChanged() {
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}

export function notifyProjectServiceDeleted(projectId: string, serviceId: string) {
  window.dispatchEvent(
    new CustomEvent(PROJECT_SERVICE_DELETED_EVENT, {
      detail: { projectId, serviceId },
    }),
  );
}

export function notifyProjectServiceCreation(
  detail: ProjectServiceCreationDetail,
) {
  window.dispatchEvent(
    new CustomEvent<ProjectServiceCreationDetail>(
      PROJECT_SERVICE_CREATION_EVENT,
      { detail },
    ),
  );
}

export async function submitProjectServiceCreation(
  projectId: string,
  creationType: "application" | "database" | "compose",
  formData: FormData,
) {
  try {
    formData.set("creationType", creationType);
    const response = await fetch(
      `/api/dokploy/projects/${encodeURIComponent(projectId)}/services`,
      { method: "POST", body: formData },
    );
    const result = (await response.json()) as {
      status?: "success" | "error";
      message?: string;
      createdService?: { id: string; type: string };
      error?: string;
    };
    return {
      status:
        response.ok && result.status === "success" ? "success" : "error",
      message:
        result.message ?? result.error ?? "Unable to create the service.",
      createdService: result.createdService,
    } as const;
  } catch {
    return {
      status: "error" as const,
      message: "Unable to reach the service creation endpoint.",
      createdService: undefined,
    };
  }
}
