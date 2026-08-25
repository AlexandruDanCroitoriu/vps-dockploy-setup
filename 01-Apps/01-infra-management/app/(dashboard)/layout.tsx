import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  getActiveDokployInstanceSummary,
  getActiveDokployInstanceId,
  getActiveDokployProvisioningJob,
  getDokployInstanceSummaries,
  getServiceTypeLabel,
  isDatabaseService,
} from "@/lib/dokploy";
import type { SidebarProject } from "@/lib/dokploy/sidebar-project-types";
import { readSidebarProjectSnapshot } from "@/lib/dokploy/sidebar-project-snapshot";
import { getDokployInstanceSummary } from "@/lib/storage/dokploy-instances";
import { DashboardShell } from "./_components/dashboard-shell/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const storedInstances = getDokployInstanceSummaries();
  const selectedInstance = await getActiveDokployInstanceSummary();
  const activeInstanceId = await getActiveDokployInstanceId();
  const provisioningJob = await getActiveDokployProvisioningJob();
  const activeInstance =
    selectedInstance ??
    (provisioningJob?.id === activeInstanceId && provisioningJob.instanceId
      ? getDokployInstanceSummary(provisioningJob.instanceId)
      : null);
  const activeProvisioning =
    provisioningJob?.status !== "complete" &&
    (provisioningJob?.id === activeInstanceId ||
      provisioningJob?.instanceId === activeInstance?.id);
  const dokployReady =
    Boolean(activeInstance) &&
    (!activeProvisioning || provisioningJob?.steps["api-key"] === "done");
  const provisioningHasInstance =
    provisioningJob &&
    (Boolean(provisioningJob.instanceId) ||
      storedInstances.some(
        (instance) => instance.rootUrl === provisioningJob.rootUrl,
      ));
  const provisioningSummary =
    provisioningJob &&
    provisioningJob.status !== "complete" &&
    !provisioningHasInstance
      ? {
          id: provisioningJob.id,
          name: `${provisioningJob.name} (setting up)`,
          rootUrl: provisioningJob.rootUrl,
          rootDomain: provisioningJob.rootDomain,
        }
      : null;
  const instances = provisioningSummary
    ? [...storedInstances, provisioningSummary]
    : storedInstances;
  const session = await getServerSession(authOptions);
  const result =
    dokployReady && activeInstance
      ? readSidebarProjectSnapshot(activeInstance.id)
      : { projects: [], error: "" };
  const projects: SidebarProject[] = result.projects.map(
    ({ projectId, name, environments }) => ({
      projectId,
      name,
      services: environments.flatMap((environment) =>
        environment.services.map((service) => ({
          id: service.id,
          type: service.type,
          name: isDatabaseService(service.type)
            ? getServiceTypeLabel(service.type)
            : service.name,
          environmentId: environment.environmentId,
        })),
      ),
    }),
  );
  return (
    <DashboardShell
      key={activeInstance?.id ?? "no-active-instance"}
      initialProjects={projects}
      initialProjectsError={result.error}
      instances={instances}
      activeInstanceId={activeInstance?.id ?? activeInstanceId}
      dokployAvailable={dokployReady}
      dokployRootUrl={activeInstance?.rootUrl ?? ""}
      userName={session?.user?.name || "Administrator"}
    >
      {children}
    </DashboardShell>
  );
}
