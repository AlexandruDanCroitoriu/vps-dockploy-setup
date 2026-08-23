"use client";

import { CodeBracketIcon, FolderIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { useClickOutside } from "@/components/ui/use-click-outside";
import type { RepositoryApplication } from "@/lib/github/repository-applications";

function normalizePath(value: string) {
  const path = value.trim();
  return path ? `/${path.replace(/^\/+|\/+$/g, "")}` : "/";
}

export function RepositoryApplicationDropdown({
  disabled,
  applications,
  deployedApplications,
  onSelect,
}: {
  disabled: boolean;
  applications: RepositoryApplication[];
  deployedApplications: Array<{ name: string; sourcePath: string | null }>;
  onSelect: (application: RepositoryApplication) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, setOpen);
  const deployedPaths = new Set(
    deployedApplications.flatMap(({ sourcePath }) =>
      sourcePath ? [normalizePath(sourcePath).toLowerCase()] : [],
    ),
  );
  const deployedNames = new Set(
    deployedApplications.map(({ name }) => name.toLowerCase()),
  );

  function select(application: RepositoryApplication) {
    setOpen(false);
    onSelect(application);
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
          {applications.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
              No application folders were found.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {applications.map((application) => {
                const deployed =
                  deployedPaths.has(
                    normalizePath(application.path).toLowerCase(),
                  ) || deployedNames.has(application.name.toLowerCase());

                return (
                  <li key={application.path}>
                    <button
                      type="button"
                      onClick={() => select(application)}
                      disabled={deployed}
                      title={
                        deployed
                          ? "Already deployed in this project"
                          : undefined
                      }
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent dark:hover:bg-indigo-500/10 dark:disabled:hover:bg-transparent"
                    >
                      <FolderIcon
                        className="size-4 shrink-0 text-indigo-500"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                          {application.name}
                        </span>
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                          {deployed
                            ? "Already deployed"
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
