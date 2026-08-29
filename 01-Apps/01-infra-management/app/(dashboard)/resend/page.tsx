import { EnvelopeIcon } from "@heroicons/react/24/outline";
import {
  listResendDomains,
  ResendConfigurationError,
  type ResendDomain,
} from "@/lib/resend/domains";
import { listDokployInstances } from "@/lib/storage/dokploy-instances";
import { ConfigureResendDomainButton } from "./configure-resend-domain-button";

export const dynamic = "force-dynamic";

function statusClasses(status: string) {
  return status === "verified"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
    : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300";
}

export default async function ResendPage() {
  const instances = listDokployInstances();
  let domains: ResendDomain[] = [];
  let error = "";

  try {
    domains = await listResendDomains();
  } catch (cause) {
    error =
      cause instanceof ResendConfigurationError
        ? "Set the server-only RESEND_API_KEY environment variable to configure domains."
        : "Unable to load domains from Resend. Check RESEND_API_KEY and try again.";
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <a
          href="https://resend.com/domains"
          target="_blank"
          rel="noreferrer"
          aria-label="Open Resend domains"
          title="Open Resend domains"
          className="rounded-md text-indigo-500 transition-colors hover:text-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          <EnvelopeIcon className="size-7" aria-hidden="true" />
        </a>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Resend domains
        </h1>
      </div>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Configure each Dockploy instance root domain in Resend and add its DNS
        records to Cloudflare automatically.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
        >
          {error}
        </div>
      ) : (
        <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
          {instances.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Add a Dockploy instance before configuring a Resend domain.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-white/10">
              {instances.map((instance) => {
                const domain = domains.find(
                  (candidate) =>
                    candidate.name.toLowerCase() ===
                    instance.rootDomain.toLowerCase(),
                );
                return (
                  <li
                    key={instance.id}
                    className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                          {instance.name}
                        </h2>
                        {domain && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(domain.status)}`}
                          >
                            {domain.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {instance.rootDomain}
                      </p>
                    </div>
                    <ConfigureResendDomainButton
                      instanceId={instance.id}
                      configured={Boolean(domain)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
