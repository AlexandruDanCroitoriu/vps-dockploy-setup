"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { DeployAfterCreateOption } from "@/components/ui/deploy-after-create-option";
import {
  ActionMessage,
  FormField,
  inputClassName,
} from "@/components/ui/form-field";
import type {
  DokployApplicationBuildType,
  DokployGithubProvider,
} from "@/lib/dokploy";
import type {
  RepositoryApplication,
  RepositoryApplicationDeployment,
} from "@/lib/github/repository-applications";
import {
  notifyProjectsChanged,
  notifyProjectServiceCreation,
  submitProjectServiceCreation,
} from "@/lib/project-events";

import {
  generateApplicationDomainAction,
  getVendureChannelsAction,
} from "../../_actions/applications";
import type { ActionState } from "../../_actions/shared";
import { RepositoryApplicationDropdown } from "./repository-application-dropdown";

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
  repositoryApplicationsError,
  rootDomain,
  deployedApplications,
  vendureBackendDeployment,
  infraManagementImageAvailability,
  vendureBackendImageAvailability,
  vendureStorefrontImageAvailability,
}: {
  projectId: string;
  environments: Array<{ environmentId: string; name: string }>;
  githubProviders: DokployGithubProvider[];
  repositoryApplications: RepositoryApplication[];
  repositoryApplicationsError: string;
  rootDomain: string;
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
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] =
    useState<RepositoryApplication | null>(null);
  const [buildType, setBuildType] =
    useState<DokployApplicationBuildType>("nixpacks");
  const [buildPath, setBuildPath] = useState("/01-Apps/");
  const [watchPaths, setWatchPaths] = useState("01-Apps/**");
  const [watchPathsEdited, setWatchPathsEdited] = useState(false);
  const [applicationName, setApplicationName] = useState("");
  const [domainHost, setDomainHost] = useState("");
  const [domainSubdomain, setDomainSubdomain] = useState("");
  const [domainGenerationError, setDomainGenerationError] = useState("");
  const [domainGenerationPending, startDomainGeneration] = useTransition();
  const [state, setState] = useState(initialState);
  const [vendureBackendId, setVendureBackendId] = useState("");
  const [vendureChannels, setVendureChannels] = useState<
    Array<{ id: string; code: string; token: string }>
  >([]);
  const [vendureChannelToken, setVendureChannelToken] = useState("");
  const [vendureChannelsError, setVendureChannelsError] = useState("");
  const [vendureChannelsPending, startVendureChannels] = useTransition();
  const latestRequestIdRef = useRef("");
  const router = useRouter();

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestId = crypto.randomUUID();
    latestRequestIdRef.current = requestId;
    const formData = new FormData(event.currentTarget);
    notifyProjectServiceCreation({
      phase: "started",
      service: {
        requestId,
        projectId,
        matchName: applicationName,
        displayName: applicationName,
        typeLabel: "Application",
        serviceType: "applications",
      },
    });
    setIsOpen(false);
    const result = await submitProjectServiceCreation(
      projectId,
      "application",
      formData,
    );
    if (latestRequestIdRef.current === requestId) {
      setState({ status: result.status, message: result.message });
    }
    if (result.status === "error") {
      if (result.createdService?.id) {
        notifyProjectServiceCreation({
          phase: "completed",
          projectId,
          requestId,
          serviceId: result.createdService.id,
        });
        router.refresh();
        notifyProjectsChanged();
      } else {
        notifyProjectServiceCreation({ phase: "failed", projectId, requestId });
      }
      if (latestRequestIdRef.current === requestId) setIsOpen(true);
      return;
    }
    if (result.createdService?.id) {
      notifyProjectServiceCreation({
        phase: "completed",
        projectId,
        requestId,
        serviceId: result.createdService.id,
      });
    }
    router.refresh();
    notifyProjectsChanged();
  }

  function updateBuildPath(value: string) {
    setBuildPath(value);
    if (!watchPathsEdited) setWatchPaths(watchPathFor(value));
  }

  function selectApplication(
    application: RepositoryApplication,
    parentDeployment?: RepositoryApplicationDeployment,
  ) {
    const path = normalizeBuildPath(application.path);
    setSelectedApplication(application);
    setBuildType("nixpacks");
    setBuildPath(path);
    setWatchPaths(watchPathFor(path));
    setWatchPathsEdited(false);
    const vendureBackend = application.kind === "vendure-backend";
    setApplicationName(
      vendureBackend
        ? "vendure"
        : (application.deploymentName ?? application.name),
    );
    const storefrontFolder = application.path.split("/").at(-1) ?? "storefront";
    setDomainHost(
      rootDomain && application.kind === "vendure-storefront"
        ? `${storefrontFolder}.${rootDomain}`
        : vendureBackend && rootDomain
          ? `vendure.${rootDomain}`
          : "",
    );
    setDomainSubdomain("");
    setDomainGenerationError("");
    const selectedVendureBackend =
      application.kind === "vendure-storefront"
        ? vendureBackendDeployment
        : parentDeployment;
    setVendureBackendId(selectedVendureBackend?.id ?? "");
    setVendureChannels([]);
    setVendureChannelToken("");
    setVendureChannelsError("");
    setIsOpen(true);
    if (
      application.kind === "vendure-storefront" &&
      selectedVendureBackend?.id
    ) {
      startVendureChannels(async () => {
        const result = await getVendureChannelsAction(
          projectId,
          selectedVendureBackend.id!,
        );
        if (result.status === "error") {
          setVendureChannelsError(result.message);
          return;
        }
        setVendureChannels(result.channels);
        const defaultChannel =
          result.channels.find(
            (channel) => channel.code.toLowerCase() === "__default_channel__",
          ) ??
          result.channels.find((channel) =>
            channel.code.toLowerCase().includes("default"),
          ) ??
          result.channels[0];
        setVendureChannelToken(defaultChannel?.token ?? "");
      });
    }
  }

  function generateDomain() {
    setDomainGenerationError("");
    startDomainGeneration(async () => {
      const result = await generateApplicationDomainAction(applicationName);
      if (result.status === "error") {
        setDomainGenerationError(result.message);
        return;
      }
      setDomainHost(result.domain);
    });
  }

  const usesInfraManagementDefaults =
    selectedApplication?.name.toLowerCase() === "01-infra-management";
  const usesVendurePreset = Boolean(selectedApplication?.kind);
  const usesVendureStorefront =
    selectedApplication?.kind === "vendure-storefront";

  return (
    <>
      <RepositoryApplicationDropdown
        disabled={environments.length === 0}
        applications={repositoryApplications}
        applicationsError={repositoryApplicationsError}
        deployedApplications={deployedApplications}
        vendureBackendDeployment={vendureBackendDeployment}
        infraManagementImageAvailability={infraManagementImageAvailability}
        vendureBackendImageAvailability={vendureBackendImageAvailability}
        vendureStorefrontImageAvailability={vendureStorefrontImageAvailability}
        onSelect={selectApplication}
      />

      {isOpen && selectedApplication && (
        <AppDialog
          open
          onClose={() => setIsOpen(false)}
          title={`Deploy ${selectedApplication.name}`}
          description={
            usesInfraManagementDefaults
              ? "Create the service from the latest image in Zot and configure its domain."
              : selectedApplication.kind === "vendure-backend"
                ? "Deploy Vendure using database and storage variables inherited from this project."
                : selectedApplication.kind === "vendure-storefront"
                  ? "Deploy a storefront connected to a channel on the existing Vendure backend."
                  : "Create the service and configure its source and build settings."
          }
          width={
            usesInfraManagementDefaults || usesVendurePreset ? "compact" : "lg"
          }
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
                size="xs"
                disabled={
                  usesVendureStorefront &&
                  (vendureChannelsPending || vendureChannels.length === 0)
                }
              >
                Create application
              </Button>
            </div>
          }
        >
          <form
            id="create-application-form"
            onSubmit={submitApplication}
            className={
              usesInfraManagementDefaults || usesVendurePreset
                ? "flex flex-col gap-4 px-5 py-4"
                : "grid gap-4 px-5 py-4 sm:grid-cols-2"
            }
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
            {usesVendurePreset && (
              <>
                <input type="hidden" name="buildType" value="nixpacks" />
                <input type="hidden" name="buildPath" value={buildPath} />
                <input type="hidden" name="watchPaths" value={watchPaths} />
                <input
                  type="hidden"
                  name="vendureBackendId"
                  value={vendureBackendId}
                />
              </>
            )}

            {usesVendureStorefront && (
              <FormField label="Vendure channel" htmlFor="vendure-channel">
                <select
                  id="vendure-channel"
                  name="vendureChannelToken"
                  required
                  value={vendureChannelToken}
                  onChange={(event) =>
                    setVendureChannelToken(event.target.value)
                  }
                  disabled={
                    vendureChannelsPending || vendureChannels.length === 0
                  }
                  className={inputClassName}
                >
                  {vendureChannelsPending || vendureChannels.length === 0 ? (
                    <option value="">
                      {vendureChannelsPending
                        ? "Loading channels…"
                        : "No channels available"}
                    </option>
                  ) : (
                    vendureChannels.map((channel) => (
                      <option key={channel.id} value={channel.token}>
                        {channel.code}
                      </option>
                    ))
                  )}
                </select>
                {vendureChannelsError && (
                  <p
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {vendureChannelsError}
                  </p>
                )}
              </FormField>
            )}

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

            {usesInfraManagementDefaults || usesVendurePreset ? (
              <>
                <input type="hidden" name="name" value={applicationName} />
                <input
                  type="hidden"
                  name="githubId"
                  value={githubProviders[0]?.githubId ?? ""}
                />
                <input
                  type="hidden"
                  name="branch"
                  value={selectedApplication.branch}
                />
                {!usesVendurePreset && (
                  <>
                    <input type="hidden" name="buildType" value="nixpacks" />
                    <input type="hidden" name="buildPath" value={buildPath} />
                    <input type="hidden" name="watchPaths" value={watchPaths} />
                  </>
                )}
              </>
            ) : (
              <>
                <FormField label="Application name" htmlFor="app-name">
                  <input
                    id="app-name"
                    name="name"
                    required
                    maxLength={63}
                    pattern="[a-zA-Z0-9._-]+"
                    value={applicationName}
                    onChange={(event) => setApplicationName(event.target.value)}
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
                        <option
                          key={provider.githubId}
                          value={provider.githubId}
                        >
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                ) : (
                  <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
                    Public Git source
                    <span className="mt-0.5 block text-gray-500 dark:text-gray-400">
                      No Dokploy GitHub provider is configured, so the public
                      HTTPS repository URL will be used.
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

                {!usesVendurePreset && (
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
                )}

                {!usesVendurePreset && (
                  <FormField label="Build path" htmlFor="app-build-path">
                    <input
                      id="app-build-path"
                      name="buildPath"
                      required
                      value={buildPath}
                      onChange={(event) => updateBuildPath(event.target.value)}
                      onBlur={() =>
                        updateBuildPath(normalizeBuildPath(buildPath))
                      }
                      placeholder="/01-Apps/02-personal-site"
                      className={inputClassName}
                    />
                  </FormField>
                )}

                {!usesVendurePreset && (
                  <FormField
                    label="Watch paths"
                    htmlFor="app-watch-paths"
                    optional
                  >
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
                )}

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
                    <FormField
                      label="Docker context"
                      htmlFor="app-docker-context"
                    >
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
                      <input
                        type="checkbox"
                        name="isStaticSpa"
                        defaultChecked
                      />
                      Single-page application fallback
                    </label>
                  </>
                )}
              </>
            )}

            {usesInfraManagementDefaults ? (
              <FormField
                label="Subdomain"
                htmlFor="app-subdomain"
                optional
                className="col-span-full"
              >
                <div className="mt-1.5 flex min-w-0 items-center rounded-md border border-gray-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-white/10 dark:bg-gray-900">
                  <input
                    id="app-subdomain"
                    name="subdomain"
                    type="text"
                    value={domainSubdomain}
                    onChange={(event) => setDomainSubdomain(event.target.value)}
                    placeholder="optional"
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm outline-none"
                  />
                  <span className="shrink-0 border-l border-gray-200 px-3 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400">
                    .{rootDomain}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Leave blank to use {rootDomain}.
                </p>
              </FormField>
            ) : (
              <FormField
                label="Domain hostname"
                htmlFor="app-host"
                optional
                className="col-span-full"
              >
                <div
                  className={
                    usesVendurePreset
                      ? "mt-1.5 w-full"
                      : "mt-1.5 grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2"
                  }
                >
                  <input
                    id="app-host"
                    name="host"
                    type="text"
                    required={usesVendurePreset}
                    value={domainHost}
                    onChange={(event) => {
                      setDomainHost(event.target.value);
                      setDomainGenerationError("");
                    }}
                    placeholder="app.example.com"
                    className={`${inputClassName} !mt-0 min-w-0`}
                  />
                  {!usesVendurePreset && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        domainGenerationPending || !applicationName.trim()
                      }
                      onClick={generateDomain}
                      className="h-full shrink-0"
                    >
                      {domainGenerationPending ? "Generating…" : "Generate"}
                    </Button>
                  )}
                </div>
                {domainGenerationError && (
                  <p
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {domainGenerationError}
                  </p>
                )}
              </FormField>
            )}

            {usesInfraManagementDefaults || usesVendurePreset ? (
              <input type="hidden" name="port" value="3000" />
            ) : (
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
            )}

            {usesInfraManagementDefaults ? (
              <input type="hidden" name="https" value="on" />
            ) : (
              <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2 dark:text-gray-300">
                <input type="checkbox" name="https" defaultChecked />
                Enable HTTPS with a Let’s Encrypt certificate
              </label>
            )}

            <div className="sm:col-span-2">
              {usesInfraManagementDefaults || usesVendurePreset ? (
                <input type="hidden" name="description" value="" />
              ) : (
                <FormField
                  label="Description"
                  htmlFor="app-description"
                  optional
                >
                  <textarea
                    id="app-description"
                    name="description"
                    maxLength={1000}
                    rows={2}
                    className={`${inputClassName} resize-y`}
                  />
                </FormField>
              )}
              {usesInfraManagementDefaults || usesVendurePreset ? (
                <input type="hidden" name="autoDeploy" value="on" />
              ) : (
                <label className="mt-4 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" name="autoDeploy" defaultChecked />
                  Automatically deploy pushes to this branch
                </label>
              )}
              <DeployAfterCreateOption
                defaultChecked
                description="Start the application's first deployment immediately."
                className="mt-4"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {usesInfraManagementDefaults || usesVendurePreset
                  ? "The domain targets the application on port 3000. You can also change domains after creation."
                  : "The port is used when a domain hostname is provided. You can also add or change domains after creation."}
              </p>
            </div>
          </form>
        </AppDialog>
      )}
    </>
  );
}
