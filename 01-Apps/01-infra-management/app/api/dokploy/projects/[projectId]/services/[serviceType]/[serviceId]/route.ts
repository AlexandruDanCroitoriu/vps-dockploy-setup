import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import {
  getComposeServiceDefinitionByName,
  resolveComposeProjectEnvironmentKeys,
  resolveComposeServiceEnvironment,
  resolveComposeServiceReferences,
} from "@/compose-services/registry";
import {
  getActiveDokployInstanceSummary,
  DOKPLOY_SERVICE_TYPES,
  getFreshDokployProject,
  getDokployDomains,
  getDokployProject,
  getDokployServiceStatus,
  isDatabaseService,
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
  removeDatabaseCredentialsFromProjectEnv,
  removeDokployProjectEnvEntries,
  removeDokployService,
  updateDokployProjectEnv,
  updateDokployServiceEnv,
  type DokployServiceType,
} from "@/lib/dokploy";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      projectId: string;
      serviceType: string;
      serviceId: string;
    }>;
  },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await getActiveDokployInstanceSummary())) {
    return Response.json(
      { error: "No Dockploy instance is selected." },
      { status: 409 },
    );
  }

  const { projectId, serviceType, serviceId } = await params;
  if (
    !projectId ||
    !serviceId ||
    !DOKPLOY_SERVICE_TYPES.includes(serviceType as DokployServiceType)
  ) {
    return Response.json({ error: "Invalid project service." }, { status: 400 });
  }

  try {
    const project = await getDokployProject(projectId);
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    const service = await getDokployServiceStatus({
      id: serviceId,
      name: "",
      appName: null,
      env: "",
      serverId: null,
      sourcePath: null,
      type: serviceType as DokployServiceType,
      status: "deploying",
      credentials: [],
    });
    const domains =
      serviceType === "applications" || serviceType === "compose"
        ? await getDokployDomains(serviceType, serviceId).catch(() => [])
        : [];
    return Response.json({
      id: service.id,
      name: service.name,
      status: service.status,
      domains,
    });
  } catch {
    return Response.json(
      { error: "Unable to load the service status." },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      projectId: string;
      serviceType: string;
      serviceId: string;
    }>;
  },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await getActiveDokployInstanceSummary())) {
    return Response.json(
      { error: "No Dockploy instance is selected." },
      { status: 409 },
    );
  }

  const { projectId, serviceType, serviceId } = await params;
  if (!projectId || !serviceType || !serviceId) {
    return Response.json(
      { error: "Invalid project service." },
      { status: 400 },
    );
  }

  try {
    const project = await getDokployProject(projectId);
    const service = project?.environments
      .flatMap((environment) => environment.services)
      .find(
        (candidate) =>
          candidate.id === serviceId && candidate.type === serviceType,
      );
    if (!service) {
      return Response.json(
        { error: "Project service not found." },
        { status: 404 },
      );
    }
    const serviceWithDetails = isDatabaseService(service.type)
      ? await getDokployServiceStatus(service)
      : service;
    const removedComposeDefinition =
      service.type === "compose"
        ? getComposeServiceDefinitionByName(service.name)
        : undefined;
    await removeDokployService(service.type, service.id);
    if (isDatabaseService(service.type) || removedComposeDefinition) {
      const refreshedProject = await getFreshDokployProject(projectId);
      const remainingServices = (refreshedProject?.environments ?? [])
        .flatMap((environment) => environment.services)
        .filter((candidate) => candidate.id !== service.id);
      let projectEnvironment = refreshedProject?.env ?? project?.env ?? "";
      if (isDatabaseService(service.type)) {
        projectEnvironment = removeDatabaseCredentialsFromProjectEnv(
          projectEnvironment,
          serviceWithDetails,
          remainingServices,
        );
      }
      if (removedComposeDefinition?.environmentTarget === "project") {
        projectEnvironment = removeDokployProjectEnvEntries(
          projectEnvironment,
          resolveComposeProjectEnvironmentKeys(removedComposeDefinition, {
            services: remainingServices,
            projectEnvironment,
          }),
        );
      }
      const managedComposes = remainingServices.flatMap((candidate) => {
        if (candidate.type !== "compose") return [];
        const definition = getComposeServiceDefinitionByName(candidate.name);
        return definition ? [{ service: candidate, definition }] : [];
      });
      for (const { definition } of managedComposes) {
        if (definition.environmentTarget !== "project") continue;
        projectEnvironment = mergeDokployProjectEnv(
          projectEnvironment,
          parseDokployEnvironmentEntries(
            resolveComposeServiceEnvironment(definition, {
              services: remainingServices,
              projectEnvironment,
            }),
          ),
        );
      }
      await updateDokployProjectEnv(projectId, projectEnvironment);
      await Promise.all(
        managedComposes.map(({ service: compose, definition }) =>
          updateDokployServiceEnv(
            "compose",
            compose.id,
            resolveComposeServiceReferences(definition, {
              services: remainingServices,
              projectEnvironment,
            }),
          ).catch(() => undefined),
        ),
      );
    }
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: "Unable to delete the service." },
      { status: 502 },
    );
  }
}
