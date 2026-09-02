import {
  ArrowTopRightOnSquareIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";

import {
  getServiceTypeLabel,
  isDatabaseService,
  type DokployDomain,
  type DokployService,
} from "@/lib/dokploy";

import { DatabaseCredentials } from "../database/database-credentials";
import { EnvironmentVariableEditor } from "../environment/environment-variable-editor";
import { ServiceLifecycleButtons } from "./service-lifecycle-buttons";
import { getServiceDomainHref } from "./service-domain-href";
import { GarageBackupControls } from "../compose/garage-backup-controls";
import type { GarageBackupConfiguration } from "@/lib/dokploy/vendure-backups";
import type { PostgresBackupConfiguration } from "@/lib/dokploy/vendure-backups";
import { PostgresBackupControls } from "../database/postgres-backup-controls";

export { getServiceDomainHref } from "./service-domain-href";

const serviceStatusStyles = {
  running: { label: "Running", dot: "bg-emerald-500" },
  deploying: { label: "Deploying", dot: "animate-pulse bg-amber-400" },
  down: { label: "Down", dot: "bg-red-500" },
} as const;

export function getServiceDisplayName(service: DokployService) {
  return isDatabaseService(service.type)
    ? getServiceTypeLabel(service.type)
    : service.name;
}

export function ServiceCard({
  service,
  dokployHref,
  showCredentialsButton = true,
  showEnvironmentEditor = true,
  projectId,
  serviceActionsMenu = false,
  serviceDeleteRedirectHref,
  domains = [],
  garageBackup,
  postgresBackup,
}: {
  service: DokployService;
  dokployHref?: string;
  showCredentialsButton?: boolean;
  showEnvironmentEditor?: boolean;
  projectId?: string;
  serviceActionsMenu?: boolean;
  serviceDeleteRedirectHref?: string;
  domains?: DokployDomain[];
  garageBackup?: {
    buckets: string[];
    configuration: GarageBackupConfiguration;
  };
  postgresBackup?: {
    buckets: string[];
    configuration: PostgresBackupConfiguration;
  };
}) {
  const status = serviceStatusStyles[service.status];
  const isDatabase = isDatabaseService(service.type);

  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-md border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-gray-900/50">
      {dokployHref ? (
        <a
          href={dokployHref}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${getServiceDisplayName(service)} in Dokploy`}
          aria-label={`Open ${getServiceDisplayName(service)} in Dokploy`}
          className="shrink-0 rounded p-1 text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
        >
          <CubeIcon className="size-4" aria-hidden="true" />
        </a>
      ) : (
        <CubeIcon className="size-4 shrink-0 text-indigo-500" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            title={status.label}
            aria-label={status.label}
            className={`size-2.5 shrink-0 rounded-full ${status.dot}`}
          />
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {getServiceDisplayName(service)}
          </p>
        </div>
        {domains.length > 0 && (
          <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1">
            {domains.map((domain) => (
              <a
                key={domain.domainId}
                href={getServiceDomainHref(service, domain)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${domain.host}`}
                className="inline-flex min-w-0 items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-500 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
              >
                <span className="max-w-52 truncate">{domain.host}</span>
                <ArrowTopRightOnSquareIcon
                  className="size-3 shrink-0"
                  aria-hidden="true"
                />
              </a>
            ))}
          </div>
        )}
      </div>
      {garageBackup && projectId && (
        <GarageBackupControls
          compact
          projectId={projectId}
          composeId={service.id}
          buckets={garageBackup.buckets}
          configuration={garageBackup.configuration}
        />
      )}
      {postgresBackup && projectId && (
        <PostgresBackupControls
          projectId={projectId}
          postgresId={service.id}
          buckets={postgresBackup.buckets}
          configuration={postgresBackup.configuration}
        />
      )}
      {!isDatabase && showEnvironmentEditor && (
        <EnvironmentVariableEditor
          target="service"
          targetId={service.id}
          targetName={service.name}
          serviceType={service.type}
          initialValue={service.env}
        />
      )}
      {isDatabase && showCredentialsButton && (
        <DatabaseCredentials
          credentials={service.credentials}
          databaseName={getServiceTypeLabel(service.type)}
        />
      )}
      {projectId && (
        <ServiceLifecycleButtons
          projectId={projectId}
          serviceId={service.id}
          serviceName={getServiceDisplayName(service)}
          appName={service.appName ?? ""}
          serviceType={service.type}
          status={service.status}
          compactMenu={serviceActionsMenu}
          deleteRedirectHref={serviceDeleteRedirectHref}
        />
      )}
    </li>
  );
}
