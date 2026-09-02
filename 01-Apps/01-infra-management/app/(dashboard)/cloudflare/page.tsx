import { CloudIcon } from "@heroicons/react/24/outline";
import {
  CloudflareConfigurationError,
  getCloudflareZones,
  type CloudflareZone,
} from "@/lib/cloudflare/zones";
import {
  getResendDomain,
  listResendDomains,
  ResendConfigurationError,
  type ResendDomain,
} from "@/lib/resend/domains";
import { listDokployInstances } from "@/lib/storage/dokploy-instances";
import { CloudflareZoneList } from "./cloudflare-zone-list";
import { CloudflareDomainsHeader } from "./cloudflare-domains-header";
import { ResendDomainsTable } from "./resend-domains-table";
import { isResendCloudflareRecord } from "./resend-records";

export const dynamic = "force-dynamic";

export default async function CloudflarePage() {
  const instances = listDokployInstances();
  let zones: CloudflareZone[] = [];
  let cloudflareError = "";
  let resendDomains: ResendDomain[] = [];
  let resendError = "";

  try {
    zones = await getCloudflareZones();
  } catch (cause) {
    cloudflareError =
      cause instanceof CloudflareConfigurationError
        ? "Set CLOUDFLARE_API_TOKEN to a Cloudflare API token with Zone:Read and DNS:Write permissions."
        : "Unable to load domains from Cloudflare. Check the token and try again.";
  }

  try {
    const listedDomains = await listResendDomains();
    resendDomains = await Promise.all(
      listedDomains.map((domain) => getResendDomain(domain.id)),
    );
  } catch (cause) {
    resendError =
      cause instanceof ResendConfigurationError
        ? "Set the server-only RESEND_API_KEY environment variable to configure domains."
        : "Unable to load domains from Resend. Check RESEND_API_KEY and try again.";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <CloudIcon className="size-7 text-indigo-500" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Cloudflare
        </h1>
      </div>
      <ResendDomainsTable
        instances={instances}
        zones={zones}
        domains={resendDomains}
        error={resendError || cloudflareError}
      />

      {cloudflareError ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
        >
          {cloudflareError}
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
          <CloudflareDomainsHeader count={zones.length} />
          {zones.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No domains were found in this Cloudflare account.
            </p>
          ) : (
            <CloudflareZoneList
              zones={zones.map(
                ({ id, name, status, paused, apexARecordId, subdomains }) => ({
                  id,
                  name,
                  status,
                  paused,
                  apexARecordId,
                  subdomains: subdomains.filter(
                    (record) =>
                      !isResendCloudflareRecord(record, resendDomains),
                  ),
                }),
              )}
            />
          )}
        </section>
      )}
    </div>
  );
}
