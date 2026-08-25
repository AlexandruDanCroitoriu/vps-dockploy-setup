import {
  getActiveDokployConfiguration,
  getActiveDokployInstanceId,
  getActiveDokployProvisioningJob,
} from "@/lib/dokploy";
import { DokployInstanceForm } from "./_components/dokploy-instances/dokploy-instance-form";
import { DeleteDokployInstanceButton } from "./_components/dokploy-instances/delete-dokploy-instance-button";
import { getDokployInstance } from "@/lib/storage/dokploy-instances";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ addDockploy?: string | string[] }>;
}) {
  const selectedInstance = await getActiveDokployConfiguration();
  const activeInstanceId = await getActiveDokployInstanceId();
  const activeProvisioningJob = await getActiveDokployProvisioningJob();
  const activeInstance =
    selectedInstance ??
    (activeProvisioningJob?.id === activeInstanceId &&
    activeProvisioningJob.instanceId
      ? getDokployInstance(activeProvisioningJob.instanceId)
      : null);
  const query = await searchParams;
  const explicitlyAddingInstance = query.addDockploy === "1";
  const addingInstance = !activeInstance || explicitlyAddingInstance;
  const provisioningJob = !explicitlyAddingInstance
    ? activeProvisioningJob
    : null;
  const visibleProvisioningJob =
    provisioningJob?.status !== "complete" ? provisioningJob : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Dashboard
      </h1>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-800/40">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {addingInstance
              ? "Add a Dockploy instance"
              : "Edit Dockploy instance"}
          </h2>
          {!addingInstance && activeInstance && (
            <DeleteDokployInstanceButton
              instanceId={activeInstance.id}
              instanceName={activeInstance.name}
            />
          )}
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {addingInstance
            ? "Save the instance first, then run the VPS setup steps."
            : "Changes are verified before the instance is updated."}
        </p>
        <DokployInstanceForm
          key={
            addingInstance
              ? (visibleProvisioningJob?.id ?? "new-empty")
              : activeInstance?.id
          }
          instance={
            addingInstance || !activeInstance
              ? null
              : {
                  id: activeInstance.id,
                  name: activeInstance.name,
                  rootUrl: activeInstance.rootUrl,
                  rootDomain: activeInstance.rootDomain,
                  vpsIp: activeInstance.vpsIp,
                  apiKey: activeInstance.apiKey,
                  defaultServiceUsername: activeInstance.defaultServiceUsername,
                  defaultServicePassword: activeInstance.defaultServicePassword,
                }
          }
          provisioningJob={provisioningJob}
          newInstanceDefaults={{
            username: process.env.infra_services_default_username?.trim() ?? "",
            password: process.env.infra_services_default_password ?? "",
          }}
        />
      </section>
    </div>
  );
}
