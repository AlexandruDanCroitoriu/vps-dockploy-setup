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
  getFreshDokployServiceStatus,
  getDokployDeployments,
  getDokployDomainServiceNames,
  getDokployDomains,
  getDokployRawComposeFile,
  getDokployRunningContainerOptions,
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
import { listCloudflareR2Buckets } from "@/lib/cloudflare/r2";
import {
  getGarageBackupConfiguration,
  getPostgresBackupConfiguration,
} from "@/lib/dokploy/vendure-backups";
import { refreshSidebarProjectSnapshot } from "@/lib/dokploy/sidebar-project-snapshot";
import {
  isVendureBackendService,
  removeVendureEmailEnvironment,
} from "@/lib/vendure/backend-environment";

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
  const instance = await getActiveDokployInstanceSummary();
  if (!instance) {
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
    return Response.json(
      { error: "Invalid project service." },
      { status: 400 },
    );
  }

  try {
    const project = await getDokployProject(projectId);
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    const service = await getFreshDokployServiceStatus({
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
    const supportsDomains =
      serviceType === "applications" || serviceType === "compose";
    const isGarage =
      serviceType === "compose" &&
      ["garage", "garage with ui"].includes(service.name.trim().toLowerCase());
    const isPostgres = serviceType === "postgres";
    const [
      deployments,
      domainServiceNames,
      runningContainerOptions,
      composeFile,
      buckets,
      garageBackup,
      postgresBackup,
    ] = await Promise.all([
      getDokployDeployments(service).catch(() => []),
      supportsDomains
        ? getDokployDomainServiceNames(service).catch(() => [])
        : Promise.resolve([]),
      supportsDomains
        ? getDokployRunningContainerOptions(service).catch(() => [])
        : Promise.resolve([]),
      serviceType === "compose"
        ? getDokployRawComposeFile(serviceId).catch(() => null)
        : Promise.resolve(null),
      isGarage || isPostgres
        ? listCloudflareR2Buckets().catch(() => [])
        : Promise.resolve([]),
      isGarage
        ? getGarageBackupConfiguration(serviceId).catch(() => null)
        : Promise.resolve(null),
      isPostgres
        ? getPostgresBackupConfiguration(serviceId).catch(() => null)
        : Promise.resolve(null),
    ]);
    const fallbackServiceNames =
      serviceType === "applications" ? [service.appName || service.name] : [];
    const serviceNames =
      domainServiceNames.length > 0 ? domainServiceNames : fallbackServiceNames;
    return Response.json({
      id: service.id,
      name: service.name,
      appName: service.appName,
      env: service.env,
      status: service.status,
      credentials: service.credentials,
      domains,
      deployments,
      serviceNames,
      serviceOptions:
        runningContainerOptions.length > 0
          ? runningContainerOptions
          : serviceNames.map((name) => ({ value: name, label: name })),
      composeFile,
      buckets: buckets.map((bucket) => bucket.name),
      garageBackup,
      postgresBackup,
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
  const instance = await getActiveDokployInstanceSummary();
  if (!instance) {
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
    const project = await getFreshDokployProject(projectId);
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
    const removedVendureBackend = isVendureBackendService(service);
    await removeDokployService(service.type, service.id);
    if (
      isDatabaseService(service.type) ||
      removedComposeDefinition ||
      removedVendureBackend
    ) {
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
      if (
        removedVendureBackend &&
        !remainingServices.some(isVendureBackendService)
      ) {
        projectEnvironment = removeVendureEmailEnvironment(projectEnvironment);
      }
      if (
        removedComposeDefinition &&
        (removedComposeDefinition.environmentTarget === "project" ||
          removedComposeDefinition.projectEnvironmentVariables) &&
        !remainingServices.some(
          (candidate) =>
            candidate.type === "compose" &&
            getComposeServiceDefinitionByName(candidate.name)?.id ===
              removedComposeDefinition.id,
        )
      ) {
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
    await refreshSidebarProjectSnapshot(instance.id);
    revalidatePath("/dokploy");
    revalidatePath(`/dokploy/${projectId}`, "layout");
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: "Unable to delete the service." },
      { status: 502 },
    );
  }
}
