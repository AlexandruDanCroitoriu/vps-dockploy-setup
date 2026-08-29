import type { CloudflareZone } from "@/lib/cloudflare/zones";
import type { ResendDnsRecord, ResendDomain } from "@/lib/resend/domains";
import type { DokployInstanceSummary } from "@/lib/storage/dokploy-instances";
import { ConfigureResendDomainButton } from "./configure-resend-domain-button";
import { normalizedResendRecordName } from "./resend-records";

function hasCloudflareRecord(
  zone: CloudflareZone | undefined,
  domain: string,
  record: ResendDnsRecord,
) {
  const expectedName = normalizedResendRecordName(record, domain);
  return zone?.subdomains.some(
    (candidate) =>
      candidate.name.toLowerCase().replace(/\.$/, "") === expectedName &&
      candidate.type === record.type &&
      candidate.content.replace(/^"|"$/g, "") ===
        record.value.replace(/^"|"$/g, ""),
  );
}

function statusClasses(healthy: boolean) {
  return healthy
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
    : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300";
}

export function ResendDomainsTable({
  instances,
  zones,
  domains,
  error,
}: {
  instances: DokployInstanceSummary[];
  zones: CloudflareZone[];
  domains: ResendDomain[];
  error: string;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-white/10">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">
          Resend email DNS
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Resend records stored in Cloudflare for each instance root domain.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="m-5 rounded-md bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-400/10 dark:text-amber-200"
        >
          {error}
        </p>
      ) : instances.length === 0 ? (
        <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Add a Dockploy instance before configuring a Resend domain.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-white/10">
            <thead className="bg-gray-50 text-xs font-medium tracking-wide text-gray-500 uppercase dark:bg-white/5 dark:text-gray-400">
              <tr>
                <th scope="col" className="px-5 py-3">
                  Instance
                </th>
                <th scope="col" className="px-5 py-3">
                  Root domain
                </th>
                <th scope="col" className="px-5 py-3">
                  Cloudflare records
                </th>
                <th scope="col" className="px-5 py-3">
                  Resend status
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              {instances.map((instance) => {
                const rootDomain = instance.rootDomain.toLowerCase();
                const domain = domains.find(
                  (candidate) => candidate.name.toLowerCase() === rootDomain,
                );
                const zone = zones.find(
                  (candidate) => candidate.name.toLowerCase() === rootDomain,
                );
                return (
                  <tr key={instance.id} className="align-top">
                    <td className="px-5 py-4 font-medium text-gray-900 dark:text-gray-100">
                      {instance.name}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-gray-600 dark:text-gray-300">
                      {instance.rootDomain}
                    </td>
                    <td className="min-w-72 px-5 py-4">
                      {domain?.records.length ? (
                        <ul className="space-y-1.5">
                          {domain.records.map((record, index) => {
                            const present = Boolean(
                              hasCloudflareRecord(zone, rootDomain, record),
                            );
                            return (
                              <li
                                key={`${record.type}-${record.name}-${index}`}
                                className="flex items-center gap-2"
                              >
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                                  {record.type}
                                </span>
                                <span
                                  className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-300"
                                  title={normalizedResendRecordName(
                                    record,
                                    rootDomain,
                                  )}
                                >
                                  {normalizedResendRecordName(
                                    record,
                                    rootDomain,
                                  )}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses(present)}`}
                                >
                                  {present ? "Present" : "Missing"}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Not configured
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(domain?.status === "verified")}`}
                      >
                        {domain?.status ?? "not configured"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <ConfigureResendDomainButton
                        instanceId={instance.id}
                        configured={Boolean(domain)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
