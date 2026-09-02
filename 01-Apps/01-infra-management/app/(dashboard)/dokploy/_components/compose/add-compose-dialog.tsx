"use client";

import { QueueListIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { DeployAfterCreateOption } from "@/components/ui/deploy-after-create-option";
import { useClickOutside } from "@/components/ui/use-click-outside";
import {
  ActionMessage,
  FormField,
  inputClassName,
} from "@/components/ui/form-field";
import {
  notifyProjectServiceCreation,
  submitProjectServiceCreation,
} from "@/lib/project-events";

import type { ActionState } from "../../_actions/shared";
import { generateComposeDomainAction } from "../../_actions/composes";
import {
  CloudflareHostnameFields,
  type CloudflareDomainOption,
} from "../domains/cloudflare-hostname-fields";

const initialState: ActionState = { status: "idle", message: "" };

type ComposeServiceOption = {
  id: string;
  name: string;
  description: string;
  supportsDomain: boolean;
  automaticDomain: boolean;
  httpsByDefault: boolean;
  domainRequired: boolean;
  defaultDomainSubdomain?: string;
  requiresLoginCredentials: boolean;
  supportsGarageCapacity: boolean;
};

export function AddComposeDialog({
  projectId,
  environmentId,
  definitions,
  rootDomain,
  cloudflareDomains = [],
  defaultLoginCredentials,
  unavailableDefinitionIds,
  r2Buckets,
}: {
  projectId: string;
  environmentId?: string;
  definitions: ComposeServiceOption[];
  rootDomain: string;
  cloudflareDomains?: CloudflareDomainOption[];
  defaultLoginCredentials: { username: string; password: string };
  unavailableDefinitionIds: string[];
  r2Buckets?: string[];
}) {
  const [isListOpen, setIsListOpen] = useState(false);
  const listRef = useClickOutside<HTMLDivElement>(isListOpen, setIsListOpen);
  const [selectedDefinition, setSelectedDefinition] =
    useState<ComposeServiceOption | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [deployAfterCreate, setDeployAfterCreate] = useState(true);
  const [state, setState] = useState(initialState);
  const [domainHost, setDomainHost] = useState("");
  const [s3Host, setS3Host] = useState("");
  const latestRequestIdRef = useRef("");
  const router = useRouter();

  async function submitCompose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDefinition) return;
    const requestId = crypto.randomUUID();
    latestRequestIdRef.current = requestId;
    const formData = new FormData(event.currentTarget);
    formData.set("environmentId", environmentId ?? "");
    notifyProjectServiceCreation({
      phase: "started",
      service: {
        requestId,
        projectId,
        matchName: selectedDefinition.name,
        displayName: selectedDefinition.name,
        typeLabel: "Compose",
        serviceType: "compose",
      },
    });
    setIsOpen(false);
    const result = await submitProjectServiceCreation(
      projectId,
      "compose",
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
  }

  const unavailableReason = environmentId
    ? "Add Compose service"
    : "Create a project environment before adding Compose";

  return (
    <>
      <div ref={listRef} className="relative">
        <button
          type="button"
          onClick={() => setIsListOpen((open) => !open)}
          disabled={!environmentId}
          title={unavailableReason}
          aria-expanded={isListOpen}
          className="inline-flex items-center rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Add Compose service</span>
          <QueueListIcon className="size-4" aria-hidden="true" />
        </button>

        {isListOpen && (
          <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900">
            <p className="border-b border-gray-200 px-3 py-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:border-white/10 dark:text-gray-400">
              Compose services
            </p>
            {definitions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                No Compose definitions are configured.
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto py-1">
                {definitions.map((definition) => {
                  const unavailable = unavailableDefinitionIds.includes(
                    definition.id,
                  );
                  return (
                    <li key={definition.id}>
                      <button
                        type="button"
                        disabled={unavailable}
                        title={
                          unavailable
                            ? `Only one ${definition.name} service is allowed per Dokploy instance`
                            : undefined
                        }
                        onClick={() => {
                          setSelectedDefinition(definition);
                          setIsOpen(true);
                          setDeployAfterCreate(true);
                          setDomainHost(
                            definition.defaultDomainSubdomain && rootDomain
                              ? `${definition.defaultDomainSubdomain}.${rootDomain}`
                              : "",
                          );
                          setS3Host(rootDomain ? `s3.${rootDomain}` : "");
                          setIsListOpen(false);
                        }}
                        className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-indigo-500/10"
                      >
                        <QueueListIcon
                          className="mt-0.5 size-4 shrink-0 text-indigo-500"
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                            {definition.name}
                          </span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {unavailable
                              ? `Only one ${definition.name} service is allowed per Dokploy instance.`
                              : definition.description}
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

      {selectedDefinition && isOpen && (
        <AppDialog
          open
          onClose={() => setIsOpen(false)}
          title={`Add ${selectedDefinition.name}`}
          description={selectedDefinition.description}
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
              <Button type="submit" form="create-compose-form" size="xs">
                Create service
              </Button>
            </div>
          }
        >
          <form
            id="create-compose-form"
            onSubmit={submitCompose}
            className="space-y-3 p-4 sm:p-6"
          >
            <input
              type="hidden"
              name="definitionId"
              value={selectedDefinition.id}
            />
            <ActionMessage status={state.status} message={state.message} />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This uses the project&apos;s default environment.
            </p>
            {selectedDefinition.requiresLoginCredentials && (
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  label={`${selectedDefinition.name} username`}
                  htmlFor="compose-login-username"
                >
                  <input
                    id="compose-login-username"
                    name="loginUsername"
                    type="text"
                    required
                    autoComplete="username"
                    defaultValue={defaultLoginCredentials.username}
                    className={inputClassName}
                  />
                </FormField>
                <FormField
                  label={`${selectedDefinition.name} password`}
                  htmlFor="compose-login-password"
                >
                  <input
                    id="compose-login-password"
                    name="loginPassword"
                    type="text"
                    required
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    defaultValue={defaultLoginCredentials.password}
                    className={inputClassName}
                  />
                </FormField>
              </div>
            )}
            {selectedDefinition.supportsGarageCapacity && (
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField
                  label="R2 backup bucket"
                  htmlFor="compose-garage-r2-bucket"
                >
                  <select
                    id="compose-garage-r2-bucket"
                    name="r2BackupBucket"
                    required
                    className={inputClassName}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a bucket
                    </option>
                    {(r2Buckets ?? []).map((bucket) => (
                      <option key={bucket} value={bucket}>
                        {bucket}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Backup folder"
                  htmlFor="compose-garage-backup-prefix"
                >
                  <input
                    id="compose-garage-backup-prefix"
                    name="r2BackupPrefix"
                    required
                    defaultValue="garage"
                    className={inputClassName}
                  />
                </FormField>
                <FormField
                  label="Daily backup time"
                  htmlFor="compose-garage-backup-time"
                >
                  <input
                    id="compose-garage-backup-time"
                    name="r2BackupTime"
                    type="time"
                    required
                    defaultValue="03:00"
                    className={inputClassName}
                  />
                </FormField>
              </div>
            )}
            {selectedDefinition.supportsGarageCapacity && (
              <FormField
                label="Garage storage capacity (GB)"
                htmlFor="compose-garage-capacity-gb"
              >
                <input
                  id="compose-garage-capacity-gb"
                  name="garageCapacityGb"
                  type="number"
                  min={1}
                  max={1_000_000}
                  step={1}
                  required
                  defaultValue={20}
                  className={inputClassName}
                />
              </FormField>
            )}
            {selectedDefinition.supportsDomain && (
              <div className="grid gap-3">
                <CloudflareHostnameFields
                  name="host"
                  value={domainHost}
                  onChange={setDomainHost}
                  domains={cloudflareDomains}
                  required={selectedDefinition.domainRequired}
                  onGenerate={() =>
                    generateComposeDomainAction(selectedDefinition.id)
                  }
                />
                {!selectedDefinition.httpsByDefault && (
                  <label className="flex h-10 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" name="https" defaultChecked />
                    HTTPS with Let&apos;s Encrypt
                  </label>
                )}
                {selectedDefinition.automaticDomain && (
                  <p className="text-xs text-gray-500 sm:col-span-2 dark:text-gray-400">
                    Select no domain to generate a Dokploy domain. HTTPS and
                    Let&apos;s Encrypt are enabled automatically.
                  </p>
                )}
              </div>
            )}
            {selectedDefinition.supportsGarageCapacity && (
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                  S3 API domain hostname
                </p>
                <CloudflareHostnameFields
                  name="s3Host"
                  value={s3Host}
                  onChange={setS3Host}
                  domains={cloudflareDomains}
                  required
                  onGenerate={() =>
                    generateComposeDomainAction(selectedDefinition.id, "s3")
                  }
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  HTTPS endpoint for Garage&apos;s S3-compatible API on port
                  3900.
                </p>
              </div>
            )}
            <DeployAfterCreateOption
              checked={deployAfterCreate}
              onChange={(event) => setDeployAfterCreate(event.target.checked)}
              description="Start the first deployment as soon as the service is created."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {deployAfterCreate
                ? "The service will be created and its first deployment started."
                : "The service is created without deploying. Review it, then use its Deploy button."}
            </p>
          </form>
        </AppDialog>
      )}
    </>
  );
}
