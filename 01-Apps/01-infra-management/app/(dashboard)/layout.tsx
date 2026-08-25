import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  getActiveDokployInstanceSummary,
  getActiveDokployInstanceId,
  getActiveDokployProvisioningJob,
  getDokployInstanceSummaries,
  getDokployProjects,
  getServiceTypeLabel,
  isDatabaseService,
} from "@/lib/dokploy";
import { getDokployInstanceSummary } from "@/lib/storage/dokploy-instances";
import {
  DashboardShell,
  type SidebarProject,
} from "./_components/dashboard-shell/dashboard-shell";

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
  const [session, result] = await Promise.all([
    getServerSession(authOptions),
    dokployReady
      ? getDokployProjects().then(
          (projects) => ({ projects, error: "" }),
          () => ({ projects: [], error: "Unable to load projects." }),
        )
      : Promise.resolve({ projects: [], error: "" }),
  ]);
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
      userName={session?.user?.name || "Administrator"}
    >
      {children}
    </DashboardShell>
  );
}
