"use client";

import {
  ChevronDownIcon,
  CodeBracketIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import {
  ActionMessage,
  FormField,
  inputClassName,
} from "@/components/ui/form-field";
import type {
  DokployApplicationBuildType,
  DokployGithubProvider,
} from "@/lib/dokploy";
import type { RepositoryApplication } from "@/lib/github/repository-applications";
import { notifyProjectsChanged } from "@/lib/project-events";

import { createApplicationAction } from "../../_actions/applications";
import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

const buildTypes: Array<{
  value: DokployApplicationBuildType;
  label: string;
}> = [
  { value: "dockerfile", label: "Dockerfile" },
  { value: "nixpacks", label: "Nixpacks" },
  { value: "railpack", label: "Railpack" },
  { value: "static", label: "Static site" },
];

function normalizeBuildPath(value: string) {
  const path = value.trim();
  if (!path) return "/";
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
}

function watchPathFor(buildPath: string) {
  const path = normalizeBuildPath(buildPath).replace(/^\//, "");
  return path ? `${path}/**` : "**";
}

export function AddApplicationDialog({
  projectId,
  environments,
  githubProviders,
  repositoryApplications,
  deployedApplications,
}: {
  projectId: string;
  environments: Array<{ environmentId: string; name: string }>;
  githubProviders: DokployGithubProvider[];
  repositoryApplications: RepositoryApplication[];
  deployedApplications: Array<{ name: string; sourcePath: string | null }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] =
    useState<RepositoryApplication | null>(null);
  const [buildType, setBuildType] =
    useState<DokployApplicationBuildType>("nixpacks");
  const [buildPath, setBuildPath] = useState("/01-Apps/");
  const [watchPaths, setWatchPaths] = useState("01-Apps/**");
  const [watchPathsEdited, setWatchPathsEdited] = useState(false);
  const action = createApplicationAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();
  const canBrowse = environments.length > 0;
  const normalizedDeployedPaths = new Set(
    deployedApplications.flatMap((application) =>
      application.sourcePath
        ? [normalizeBuildPath(application.sourcePath).toLowerCase()]
        : [],
    ),
  );
  const deployedNames = new Set(
    deployedApplications.map((application) => application.name.toLowerCase()),
  );

  useEffect(() => {
    if (state.status !== "success") return;
    queueMicrotask(() => {
      setIsOpen(false);
      router.refresh();
      notifyProjectsChanged();
    });
  }, [router, state]);

  function updateBuildPath(value: string) {
    setBuildPath(value);
    if (!watchPathsEdited) setWatchPaths(watchPathFor(value));
  }

  function selectApplication(application: RepositoryApplication) {
    const path = normalizeBuildPath(application.path);
    setSelectedApplication(application);
    setBuildPath(path);
    setWatchPaths(watchPathFor(path));
    setWatchPathsEdited(false);
    setIsListOpen(false);
    setIsOpen(true);
  }

  const unavailableReason =
    environments.length === 0
      ? "Create a project environment before adding an application"
      : "Choose an application";

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsListOpen((open) => !open)}
          disabled={!canBrowse}
          title={unavailableReason}
          aria-expanded={isListOpen}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CodeBracketIcon className="size-4" aria-hidden="true" />
          Add application
          <ChevronDownIcon className="size-3.5" aria-hidden="true" />
        </button>
        {isListOpen && (
          <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900">
            <p className="border-b border-gray-200 px-3 py-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:border-white/10 dark:text-gray-400">
              Repository /01-Apps
            </p>
            {repositoryApplications.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                No application folders were found.
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto py-1">
                {repositoryApplications.map((application) => (
                  <li key={application.path}>
                    {(() => {
                      const isDeployed =
                        normalizedDeployedPaths.has(
                          normalizeBuildPath(application.path).toLowerCase(),
                        ) || deployedNames.has(application.name.toLowerCase());
                      return (
                        <button
                          type="button"
                          onClick={() => selectApplication(application)}
                          disabled={isDeployed}
                          title={
                            isDeployed
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
                              {isDeployed
                                ? "Already deployed"
                                : `/${application.path}`}
                            </span>
                          </span>
                        </button>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {isOpen && selectedApplication && (
        <AppDialog
          open
          onClose={() => setIsOpen(false)}
          title={`Deploy ${selectedApplication.name}`}
          description="Create the service and configure its source and build settings."
          width="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setIsOpen(false)}
                variant="secondary"
                size="xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-application-form"
                disabled={pending}
                size="xs"
              >
                {pending ? "Creating…" : "Create application"}
              </Button>
            </div>
          }
        >
          <form
            id="create-application-form"
            action={formAction}
            className="grid gap-4 px-5 py-4 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <ActionMessage status={state.status} message={state.message} />
            </div>

            <input
              type="hidden"
              name="owner"
              value={selectedApplication.owner}
            />
            <input
              type="hidden"
              name="repository"
              value={selectedApplication.repository}
            />

            {environments.length === 1 ? (
              <input
                type="hidden"
                name="environmentId"
                value={environments[0].environmentId}
              />
            ) : (
              <FormField label="Environment" htmlFor="app-environment">
                <select
                  id="app-environment"
                  name="environmentId"
                  required
                  className={inputClassName}
                >
                  {environments.map((environment) => (
                    <option
                      key={environment.environmentId}
                      value={environment.environmentId}
                    >
                      {environment.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <FormField label="Application name" htmlFor="app-name">
              <input
                id="app-name"
                name="name"
                required
                maxLength={63}
                pattern="[a-zA-Z0-9._-]+"
                defaultValue={selectedApplication.name}
                className={inputClassName}
              />
            </FormField>

            {githubProviders.length > 0 ? (
              <FormField label="GitHub connection" htmlFor="app-github">
                <select
                  id="app-github"
                  name="githubId"
                  required
                  className={inputClassName}
                >
                  {githubProviders.map((provider) => (
                    <option key={provider.githubId} value={provider.githubId}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : (
              <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
                Public Git source
                <span className="mt-0.5 block text-gray-500 dark:text-gray-400">
                  No Dokploy GitHub provider is configured, so the public HTTPS
                  repository URL will be used.
                </span>
              </div>
            )}

            <FormField label="Branch" htmlFor="app-branch">
              <input
                id="app-branch"
                name="branch"
                required
                defaultValue={selectedApplication.branch}
                className={inputClassName}
              />
            </FormField>

            <FormField label="Build type" htmlFor="app-build-type">
              <select
                id="app-build-type"
                name="buildType"
                value={buildType}
                onChange={(event) =>
                  setBuildType(
                    event.target.value as DokployApplicationBuildType,
                  )
                }
                className={inputClassName}
              >
                {buildTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Build path" htmlFor="app-build-path">
              <input
                id="app-build-path"
                name="buildPath"
                required
                value={buildPath}
                onChange={(event) => updateBuildPath(event.target.value)}
                onBlur={() => updateBuildPath(normalizeBuildPath(buildPath))}
                placeholder="/01-Apps/02-personal-site"
                className={inputClassName}
              />
            </FormField>

            <FormField label="Watch paths" htmlFor="app-watch-paths" optional>
              <textarea
                id="app-watch-paths"
                name="watchPaths"
                value={watchPaths}
                onChange={(event) => {
                  setWatchPathsEdited(true);
                  setWatchPaths(event.target.value);
                }}
                rows={2}
                placeholder="01-Apps/02-personal-site/**"
                className={`${inputClassName} resize-y`}
              />
            </FormField>

            {buildType === "dockerfile" && (
              <>
                <FormField label="Dockerfile" htmlFor="app-dockerfile">
                  <input
                    id="app-dockerfile"
                    name="dockerfile"
                    defaultValue="Dockerfile"
                    className={inputClassName}
                  />
                </FormField>
                <FormField label="Docker context" htmlFor="app-docker-context">
                  <input
                    id="app-docker-context"
                    name="dockerContextPath"
                    defaultValue="."
                    className={inputClassName}
                  />
                </FormField>
              </>
            )}

            {buildType === "static" && (
              <>
                <FormField
                  label="Publish directory"
                  htmlFor="app-publish-directory"
                >
                  <input
                    id="app-publish-directory"
                    name="publishDirectory"
                    defaultValue="dist"
                    className={inputClassName}
                  />
                </FormField>
                <label className="mt-6 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" name="isStaticSpa" defaultChecked />
                  Single-page application fallback
                </label>
              </>
            )}

            <FormField label="Domain hostname" htmlFor="app-host" optional>
              <input
                id="app-host"
                name="host"
                type="text"
                placeholder="app.example.com"
                className={inputClassName}
              />
            </FormField>

            <FormField label="Container port" htmlFor="app-port">
              <input
                id="app-port"
                name="port"
                type="number"
                min={1}
                max={65535}
                defaultValue={3000}
                className={inputClassName}
              />
            </FormField>

            <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2 dark:text-gray-300">
              <input type="checkbox" name="https" defaultChecked />
              Enable HTTPS with a Let’s Encrypt certificate
            </label>

            <div className="sm:col-span-2">
              <FormField label="Description" htmlFor="app-description" optional>
                <textarea
                  id="app-description"
                  name="description"
                  maxLength={1000}
                  rows={2}
                  className={`${inputClassName} resize-y`}
                />
              </FormField>
              <label className="mt-4 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" name="autoDeploy" defaultChecked />
                Automatically deploy pushes to this branch
              </label>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                The port is used when a domain hostname is provided. You can
                also add or change domains after creation.
              </p>
            </div>
          </form>
        </AppDialog>
      )}
    </>
  );
}
