import {
  getActiveDokployConfiguration,
  getActiveDokployInstanceId,
  getActiveDokployProvisioningJob,
} from "@/lib/dokploy";
import { DokployInstanceForm } from "../_components/dokploy-instances/dokploy-instance-form";
import { DeleteDokployInstanceButton } from "../_components/dokploy-instances/delete-dokploy-instance-button";
import { getDokployInstance } from "@/lib/storage/dokploy-instances";
import {
  CloudflareConfigurationError,
  getCloudflareZones,
} from "@/lib/cloudflare/zones";
import { inspectDokployBootstrapResources } from "@/lib/dokploy/bootstrap-zot";
import { reconcileDokployResourceSteps } from "@/lib/storage/dokploy-provisioning";

export default async function InstancePage({
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
  let provisioningJob = !explicitlyAddingInstance
    ? activeProvisioningJob
    : null;
  if (
    provisioningJob?.status === "complete" &&
    provisioningJob.apiKey &&
    provisioningJob.instanceId
  ) {
    try {
      const resources = await inspectDokployBootstrapResources({
        baseUrl: `http://${provisioningJob.vpsIp}:3000`,
        apiKey: provisioningJob.apiKey,
      });
      provisioningJob = reconcileDokployResourceSteps(
        provisioningJob.id,
        resources,
      );
    } catch {
      // Keep the last known step state when live Dokploy inspection is unavailable.
    }
  }
  const visibleProvisioningJob =
    provisioningJob?.status !== "complete" ? provisioningJob : null;
  let cloudflareDomains: { name: string; ipAddress: string }[] = [];
  let cloudflareError = "";

  try {
    cloudflareDomains = (await getCloudflareZones()).map(
      ({ name, ipAddress }) => ({ name, ipAddress }),
    );
  } catch (cause) {
    cloudflareError =
      cause instanceof CloudflareConfigurationError
        ? "Configure CLOUDFLARE_API_TOKEN to load domains."
        : "Unable to load domains from Cloudflare.";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Instance
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
          cloudflareDomains={cloudflareDomains}
          cloudflareError={cloudflareError}
          newInstanceDefaults={{
            username: process.env.INFRA_SERVICES_DEFAULT_USERNAME?.trim() ?? "",
            password: process.env.INFRA_SERVICES_DEFAULT_PASSWORD ?? "",
          }}
        />
      </section>
    </div>
  );
}
