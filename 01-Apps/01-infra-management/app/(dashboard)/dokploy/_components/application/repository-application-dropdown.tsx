"use client";

import { CodeBracketIcon, FolderIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { useClickOutside } from "@/components/ui/use-click-outside";
import type { RepositoryApplication } from "@/lib/github/repository-applications";
import { isRepositoryApplicationDeployed } from "@/lib/github/repository-applications";
import type { RepositoryApplicationDeployment } from "@/lib/github/repository-applications";

export function RepositoryApplicationDropdown({
  disabled,
  applications,
  applicationsError,
  deployedApplications,
  vendureBackendDeployment,
  infraManagementImageAvailability,
  vendureBackendImageAvailability,
  vendureStorefrontImageAvailability,
  onSelect,
}: {
  disabled: boolean;
  applications: RepositoryApplication[];
  applicationsError: string;
  deployedApplications: RepositoryApplicationDeployment[];
  vendureBackendDeployment?: RepositoryApplicationDeployment;
  infraManagementImageAvailability: {
    available: boolean;
    message: string;
  };
  vendureBackendImageAvailability: { available: boolean; message: string };
  vendureStorefrontImageAvailability: Record<
    string,
    { available: boolean; message: string }
  >;
  onSelect: (
    application: RepositoryApplication,
    parentDeployment?: RepositoryApplicationDeployment,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, setOpen);

  function select(
    application: RepositoryApplication,
    parentDeployment?: RepositoryApplicationDeployment,
  ) {
    setOpen(false);
    onSelect(application, parentDeployment);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        title={
          disabled
            ? "Create a project environment before adding an application"
            : "Add application"
        }
        aria-expanded={open}
        className="inline-flex items-center rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="sr-only">Add application</span>
        <CodeBracketIcon className="size-4" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900">
          <p className="border-b border-gray-200 px-3 py-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:border-white/10 dark:text-gray-400">
            Repository /01-Apps
          </p>
          {applicationsError ? (
            <p
              role="alert"
              className="px-3 py-4 text-sm text-red-600 dark:text-red-300"
            >
              {applicationsError} Check the server-only GITHUB_TOKEN and
              repository access.
            </p>
          ) : applications.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
              No application folders were found.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {applications.map((application) => {
                const parentDeployment = application.parentPath
                  ? vendureBackendDeployment
                  : undefined;
                const deployed = isRepositoryApplicationDeployed(
                  application,
                  deployedApplications,
                );
                const isInfraManagement =
                  application.name.toLowerCase() === "01-infra-management";
                const registryUnavailable =
                  isInfraManagement &&
                  !infraManagementImageAvailability.available;
                const vendureRegistryUnavailable =
                  application.kind === "vendure-backend" &&
                  !vendureBackendImageAvailability.available;
                const missingVendureBackend =
                  application.kind === "vendure-storefront" &&
                  !parentDeployment?.id;
                const storefrontImageAvailability =
                  vendureStorefrontImageAvailability[`/${application.path}`];
                const storefrontRegistryUnavailable =
                  application.kind === "vendure-storefront" &&
                  !storefrontImageAvailability?.available;
                const unavailable =
                  deployed ||
                  registryUnavailable ||
                  vendureRegistryUnavailable ||
                  storefrontRegistryUnavailable ||
                  missingVendureBackend;

                return (
                  <li key={application.path}>
                    <button
                      type="button"
                      onClick={() => select(application, parentDeployment)}
                      disabled={unavailable}
                      title={
                        deployed
                          ? "Already deployed on this Dockploy instance"
                          : registryUnavailable
                            ? infraManagementImageAvailability.message
                            : vendureRegistryUnavailable
                              ? vendureBackendImageAvailability.message
                              : storefrontRegistryUnavailable
                                ? (storefrontImageAvailability?.message ??
                                  "The storefront image is not available in Zot.")
                                : missingVendureBackend
                                  ? "Deploy the Vendure backend first"
                                  : undefined
                      }
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent dark:hover:bg-indigo-500/10 dark:disabled:hover:bg-transparent ${application.kind === "vendure-storefront" ? "pl-8" : ""}`}
                    >
                      <FolderIcon
                        className="size-4 shrink-0 text-indigo-500"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
                          <span className="truncate">{application.name}</span>
                        </span>
                        <span
                          className={`block text-xs ${
                            registryUnavailable
                              ? "text-red-600 dark:text-red-400"
                              : "truncate text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {deployed
                            ? "Already deployed on this instance"
                            : registryUnavailable
                              ? infraManagementImageAvailability.message
                              : vendureRegistryUnavailable
                                ? vendureBackendImageAvailability.message
                                : missingVendureBackend
                                  ? "Deploy the Vendure backend first"
                                  : `/${application.path}`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
