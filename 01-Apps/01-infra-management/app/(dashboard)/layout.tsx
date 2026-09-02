import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  getActiveDokployInstanceSummary,
  getActiveDokployInstanceId,
  getActiveDokployProvisioningJob,
  getDokployInstanceSummaries,
} from "@/lib/dokploy";
import { getDokployInstanceSummary } from "@/lib/storage/dokploy-instances";
import { areProjectBuildsEnabled } from "@/lib/repository-workspace";
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
  return (
    <DashboardShell
      key={activeInstance?.id ?? "no-active-instance"}
      instances={instances}
      activeInstanceId={activeInstance?.id ?? activeInstanceId}
      dokployAvailable={dokployReady}
      projectBuildsEnabled={areProjectBuildsEnabled()}
      userName={session?.user?.name || "Administrator"}
    >
      {children}
    </DashboardShell>
  );
}
