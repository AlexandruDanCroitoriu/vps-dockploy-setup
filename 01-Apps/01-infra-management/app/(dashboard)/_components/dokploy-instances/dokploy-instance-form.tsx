"use client";

import {
  CheckIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { ActionMessage, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  createDokployInstanceAction,
  verifyRootDomainIpAction,
  updateDokployInstanceAction,
} from "../../_actions/dokploy-instances";
import type { ActionState } from "../../dokploy/_actions/shared";
import {
  DOKPLOY_BOOTSTRAP_STEPS,
  type DokployBootstrapStep,
  type DokployBootstrapStepStatus,
} from "@/lib/vps/bootstrap-progress";
import type { DokployProvisioningJob } from "@/lib/storage/dokploy-provisioning";
import { Select } from "@/components/ui/select";

const initialState: ActionState = { status: "idle", message: "" };
const stepLabels: Record<DokployBootstrapStep, string> = {
  updating: "Updating and upgrading operating system",
  installing: "Installing and starting Dokploy",
  administrator: "Creating Dokploy administrator",
  "api-key": "Generating and verifying API/CLI key",
  domain: "Configuring HTTPS domain",
  "main-project": "Creating Main project",
  zot: "Deploying Zot to Main project",
};

export function DokployInstanceForm({
  instance,
  provisioningJob = null,
  newInstanceDefaults = { username: "admin", password: "admin" },
  cloudflareDomains = [],
  cloudflareError = "",
}: {
  instance: {
    id: string;
    name: string;
    rootUrl: string;
    rootDomain: string;
    vpsIp: string;
    apiKey: string;
    defaultServiceUsername: string;
    defaultServicePassword: string;
  } | null;
  provisioningJob?: DokployProvisioningJob | null;
  newInstanceDefaults?: { username: string; password: string };
  cloudflareDomains?: { name: string; ipAddress: string }[];
  cloudflareError?: string;
}) {
  const isEditing = Boolean(instance);
  const [instanceName, setInstanceName] = useState(
    instance?.name ?? provisioningJob?.name ?? "",
  );
  const [rootDomain, setRootDomain] = useState(
    instance?.rootDomain ?? provisioningJob?.rootDomain ?? "",
  );
  const [vpsIp, setVpsIp] = useState(
    instance?.vpsIp ?? provisioningJob?.vpsIp ?? "",
  );
  const [apiKey, setApiKey] = useState(
    instance?.apiKey ?? provisioningJob?.apiKey ?? "",
  );
  const defaultServiceUsername =
    instance?.defaultServiceUsername ??
    provisioningJob?.defaultServiceUsername ??
    newInstanceDefaults.username;
  const defaultServicePassword =
    instance?.defaultServicePassword ??
    provisioningJob?.defaultServicePassword ??
    newInstanceDefaults.password;
  const [vpsIpError, setVpsIpError] = useState("");
  const [vpsIpVerified, setVpsIpVerified] = useState(false);
  const [vpsIpPending, startVpsIpResolution] = useTransition();
  const vpsIpRequestRef = useRef(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [showDefaultPassword, setShowDefaultPassword] = useState(false);
  const [defaultPasswordCopied, setDefaultPasswordCopied] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState<
    DokployBootstrapStep | "all" | null
  >(null);
  const [bootstrapPending, setBootstrapPending] = useState(
    provisioningJob?.status === "running",
  );
  const [bootstrapError, setBootstrapError] = useState(
    provisioningJob?.error ?? "",
  );
  const [bootstrapSteps, setBootstrapSteps] = useState<
    Partial<Record<DokployBootstrapStep, DokployBootstrapStepStatus>>
  >(provisioningJob?.steps ?? {});
  const [bootstrapLogs, setBootstrapLogs] = useState<
    Partial<Record<DokployBootstrapStep, string[]>>
  >(provisioningJob?.logs ?? {});
  const provisioningJobId = provisioningJob?.id ?? "";
  const [automaticSetup, setAutomaticSetup] = useState(false);
  const setupComplete = provisioningJob?.status === "complete";
  const hasChanges = isEditing && instanceName.trim() !== instance!.name;
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const defaultPasswordRef = useRef<HTMLInputElement>(null);
  const dockployUrl = rootDomain.trim()
    ? `https://dockploy.${rootDomain.trim().toLowerCase().replace(/\.$/, "")}`
    : "";
  const action = instance
    ? updateDokployInstanceAction.bind(null, instance.id)
    : createDokployInstanceAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  async function copyProvisioningLogs(target: DokployBootstrapStep | "all") {
    const value =
      target === "all"
        ? DOKPLOY_BOOTSTRAP_STEPS.flatMap((step) => {
            const logs = bootstrapLogs[step] ?? [];
            return logs.length > 0
              ? [`${stepLabels[step]}\n${logs.join("\n")}`]
              : [];
          }).join("\n\n")
        : (bootstrapLogs[target] ?? []).join("\n");
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedLogs(target);
      window.setTimeout(
        () => setCopiedLogs((current) => (current === target ? null : current)),
        1_500,
      );
    } catch {
      setCopiedLogs(null);
    }
  }

  useEffect(() => {
    if (!provisioningJobId || !bootstrapPending) return;
    const interval = window.setInterval(async () => {
      const response = await fetch(
        `/api/dokploy-instances/bootstrap?id=${encodeURIComponent(provisioningJobId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const job = (await response.json()) as DokployProvisioningJob;
      setBootstrapSteps(job.steps);
      setBootstrapLogs(job.logs);
      setApiKey(job.apiKey);
      setBootstrapError(job.error);
      if (job.status === "complete" && job.instanceId) {
        window.clearInterval(interval);
        setBootstrapPending(false);
        router.refresh();
      } else if (job.status === "failed") {
        setBootstrapPending(false);
        window.clearInterval(interval);
      } else if (Date.now() - new Date(job.updatedAt).getTime() > 60_000) {
        setBootstrapPending(false);
        setBootstrapError(
          "The previous setup process stopped updating. Start it again to clear its logs and rerun every step.",
        );
        window.clearInterval(interval);
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [bootstrapPending, provisioningJobId, router]);

  useEffect(() => {
    if (state.status !== "success") return;
    if (!isEditing) {
      formRef.current?.reset();
    }
    router.replace("/");
    router.refresh();
  }, [isEditing, router, state.status]);

  useEffect(() => {
    const requestId = ++vpsIpRequestRef.current;
    if (isEditing) return;
    const domain = rootDomain.trim();
    if (!domain) return;
    const requestDomain = domain;
    const timeout = window.setTimeout(() => {
      startVpsIpResolution(async () => {
        const result = await verifyRootDomainIpAction(requestDomain, vpsIp);
        if (vpsIpRequestRef.current !== requestId) return;
        if (result.status === "success") {
          setVpsIp(result.ipAddress);
          setVpsIpError("");
          setVpsIpVerified(true);
        } else {
          setVpsIpError(result.message);
          setVpsIpVerified(false);
        }
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [isEditing, rootDomain, vpsIp]);

  async function runSavedStep(step: DokployBootstrapStep) {
    if (!provisioningJobId || bootstrapPending) return;
    setBootstrapPending(true);
    setBootstrapError("");
    setBootstrapSteps((current) => ({ ...current, [step]: "running" }));
    try {
      const response = await fetch("/api/dokploy-instances/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: provisioningJobId, step }),
      });
      const job = (await response.json()) as DokployProvisioningJob & {
        message?: string;
      };
      if (!response.ok)
        throw new Error(job.message || job.error || "VPS setup failed.");
      setBootstrapSteps(job.steps);
      setBootstrapLogs(job.logs);
      setApiKey(job.apiKey);
      setBootstrapError(job.error);
      if (
        job.status === "complete" ||
        (step === "api-key" && job.steps["api-key"] === "done") ||
        (step === "main-project" && job.steps["main-project"] === "done")
      ) {
        router.refresh();
      }
      if (automaticSetup) {
        const next = DOKPLOY_BOOTSTRAP_STEPS.find(
          (candidate) => job.steps[candidate] !== "done",
        );
        if (next) {
          setBootstrapPending(false);
          window.setTimeout(() => runSavedStep(next), 0);
          return;
        }
      }
    } catch (error) {
      setBootstrapError(
        error instanceof Error ? error.message : "VPS setup failed.",
      );
      const response = await fetch(
        `/api/dokploy-instances/bootstrap?id=${encodeURIComponent(provisioningJobId)}`,
        { cache: "no-store" },
      );
      if (response.ok) {
        const job = (await response.json()) as DokployProvisioningJob;
        setBootstrapSteps(job.steps);
        setBootstrapLogs(job.logs);
      }
    } finally {
      setBootstrapPending(false);
    }
  }

  return (
    <div
      className={
        !isEditing || provisioningJob
          ? "mt-5 grid gap-5 lg:grid-cols-2"
          : "mt-5"
      }
    >
      <form
        ref={formRef}
        action={formAction}
        autoComplete="off"
        className="space-y-4"
      >
        <ActionMessage
          status={bootstrapError ? "error" : state.status}
          message={bootstrapError || state.message}
        />
        <FormField label="Name" htmlFor="dockploy-name">
          <Input
            id="dockploy-name"
            name="name"
            required
            maxLength={100}
            autoComplete="off"
            placeholder="Production"
            value={instanceName}
            onChange={(event) => setInstanceName(event.target.value)}
          />
        </FormField>
        <div className="space-y-4">
          <FormField label="Root domain" htmlFor="dockploy-root-domain">
            <div className="flex items-center gap-2">
              <div className="mt-1.5 flex shrink-0 items-center gap-1">
                <a
                  href={vpsIp ? `http://${vpsIp}:3000` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open Dockploy using IP address"
                  title="Open Dockploy using IP address"
                  aria-disabled={!vpsIp}
                  className={`rounded-md border p-2 ${vpsIp ? "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5" : "pointer-events-none border-gray-200 text-gray-300 dark:border-white/5 dark:text-gray-600"}`}
                >
                  <CommandLineIcon className="size-5" aria-hidden="true" />
                </a>
                <a
                  href={dockployUrl || undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open Dockploy using domain"
                  title="Open Dockploy using domain"
                  aria-disabled={!dockployUrl}
                  className={`rounded-md border p-2 ${dockployUrl ? "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5" : "pointer-events-none border-gray-200 text-gray-300 dark:border-white/5 dark:text-gray-600"}`}
                >
                  <GlobeAltIcon className="size-5" aria-hidden="true" />
                </a>
              </div>
              <Select
                className="min-w-0 flex-1"
                id="dockploy-root-domain"
                name={isEditing ? undefined : "rootDomain"}
                required
                disabled={isEditing}
                value={rootDomain}
                onChange={(event) => {
                  const value = event.target.value;
                  setRootDomain(value);
                  setVpsIp(
                    cloudflareDomains.find((domain) => domain.name === value)
                      ?.ipAddress ?? "",
                  );
                  setVpsIpError("");
                  setVpsIpVerified(false);
                }}
              >
                <option value="">Select a Cloudflare domain</option>
                {rootDomain &&
                  !cloudflareDomains.some(
                    ({ name }) => name === rootDomain,
                  ) && (
                    <option value={rootDomain}>{rootDomain} (current)</option>
                  )}
                {cloudflareDomains.map(({ name, ipAddress }) => (
                  <option key={name} value={name} disabled={!ipAddress}>
                    {name}
                    {ipAddress ? ` — ${ipAddress}` : " — no apex A record"}
                  </option>
                ))}
              </Select>
              {isEditing && (
                <input type="hidden" name="rootDomain" value={rootDomain} />
              )}
            </div>
            {isEditing && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The domain cannot be changed after the instance is created.
              </p>
            )}
            {!isEditing && cloudflareError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {cloudflareError}
              </p>
            )}
          </FormField>
          <FormField label="Cloudflare IP address" htmlFor="dockploy-vps-ip">
            <Input
              id="dockploy-vps-ip"
              autoComplete="off"
              placeholder={vpsIpPending ? "Resolving…" : "203.0.113.10"}
              value={vpsIp}
              readOnly
              disabled={isEditing}
              name={isEditing ? undefined : "ipAddress"}
              tabIndex={-1}
              className="cursor-default bg-gray-50 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400"
            />
            {isEditing && (
              <input type="hidden" name="ipAddress" value={vpsIp} />
            )}
            {vpsIpError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {vpsIpError}
              </p>
            )}
            {vpsIpVerified && !vpsIpError && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircleIcon className="size-4" aria-hidden="true" />
                Root domain resolves to this IP.
              </p>
            )}
          </FormField>
        </div>
        <fieldset className="rounded-md border border-gray-200 p-4 dark:border-white/10">
          <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Default service credentials
          </legend>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Used for services such as DBGate. During a new VPS setup these also
            become the initial Dokploy administrator credentials; use an email
            address as the username.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Default email" htmlFor="default-service-username">
              <Input
                id="default-service-username"
                name="defaultServiceUsername"
                type="email"
                required
                maxLength={255}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                value={defaultServiceUsername}
                readOnly
                className="cursor-default bg-gray-50 dark:bg-gray-900/50"
              />
            </FormField>
            <FormField
              label="Default password"
              htmlFor="default-service-password"
            >
              <div className="relative">
                <Input
                  ref={defaultPasswordRef}
                  id="default-service-password"
                  name="defaultServicePassword"
                  type="text"
                  required
                  maxLength={255}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={defaultServicePassword}
                  readOnly
                  className={`cursor-default bg-gray-50 pr-20 dark:bg-gray-900/50 ${showDefaultPassword ? "" : "[-webkit-text-security:disc]"}`}
                />
                <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const value =
                        defaultPasswordRef.current?.value ??
                        defaultServicePassword;
                      if (!value) return;
                      try {
                        await navigator.clipboard.writeText(value);
                        setDefaultPasswordCopied(true);
                        window.setTimeout(
                          () => setDefaultPasswordCopied(false),
                          1500,
                        );
                      } catch {
                        setDefaultPasswordCopied(false);
                      }
                    }}
                    aria-label={
                      defaultPasswordCopied
                        ? "Default password copied"
                        : "Copy default password"
                    }
                    className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
                  >
                    {defaultPasswordCopied ? (
                      <CheckIcon
                        className="size-5 text-emerald-600"
                        aria-hidden="true"
                      />
                    ) : (
                      <ClipboardDocumentIcon
                        className="size-5"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setShowDefaultPassword((visible) => !visible)
                    }
                    aria-label={
                      showDefaultPassword
                        ? "Hide default password"
                        : "Show default password"
                    }
                    aria-pressed={showDefaultPassword}
                    className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
                  >
                    {showDefaultPassword ? (
                      <EyeSlashIcon className="size-5" aria-hidden="true" />
                    ) : (
                      <EyeIcon className="size-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </FormField>
          </div>
        </fieldset>
        <FormField label="API/CLI key" htmlFor="dockploy-api-key">
          <div className="relative">
            <Input
              ref={apiKeyRef}
              id="dockploy-api-key"
              name="apiKey"
              type="text"
              required={isEditing}
              maxLength={4096}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={apiKey}
              readOnly
              className={`cursor-default bg-gray-50 pr-20 dark:bg-gray-900/50 ${showApiKey ? "" : "[-webkit-text-security:disc]"}`}
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
              <button
                type="button"
                onClick={async () => {
                  const value = apiKeyRef.current?.value ?? apiKey;
                  if (!value) return;
                  try {
                    await navigator.clipboard.writeText(value);
                    setApiKeyCopied(true);
                    window.setTimeout(() => setApiKeyCopied(false), 1500);
                  } catch {
                    setApiKeyCopied(false);
                  }
                }}
                aria-label={
                  apiKeyCopied ? "API/CLI key copied" : "Copy API/CLI key"
                }
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                {apiKeyCopied ? (
                  <CheckIcon
                    className="size-5 text-emerald-600"
                    aria-hidden="true"
                  />
                ) : (
                  <ClipboardDocumentIcon
                    className="size-5"
                    aria-hidden="true"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowApiKey((visible) => !visible)}
                aria-label={
                  showApiKey ? "Hide API/CLI key" : "Show API/CLI key"
                }
                aria-pressed={showApiKey}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                {showApiKey ? (
                  <EyeSlashIcon className="size-5" aria-hidden="true" />
                ) : (
                  <EyeIcon className="size-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          {!isEditing && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Generated automatically during VPS setup.
            </p>
          )}
        </FormField>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="md"
            disabled={
              pending ||
              bootstrapPending ||
              (isEditing && !hasChanges) ||
              Boolean(provisioningJob && !setupComplete)
            }
          >
            {pending
              ? "Saving…"
              : instance
                ? "Save changes"
                : "Add new instance"}
          </Button>
        </div>
      </form>
      {(!isEditing || provisioningJob) && (
        <aside className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-gray-900/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                VPS setup progress
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {setupComplete
                  ? "Setup completed. Review the status and logs for each step."
                  : provisioningJobId
                    ? "Run each step yourself or continue automatically."
                    : "Save the instance to enable the first setup step."}
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              <span>
                {setupComplete
                  ? "Complete"
                  : automaticSetup
                    ? "Automatic"
                    : "Manual"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={automaticSetup}
                aria-label="Continue setup automatically"
                disabled={!provisioningJobId || setupComplete}
                onClick={() => setAutomaticSetup((value) => !value)}
                className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${automaticSetup ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${automaticSetup ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={
                !Object.values(bootstrapLogs).some((logs) => logs?.length)
              }
              onClick={() => copyProvisioningLogs("all")}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
            >
              {copiedLogs === "all" ? (
                <CheckIcon
                  className="size-4 text-emerald-500"
                  aria-hidden="true"
                />
              ) : (
                <ClipboardDocumentIcon className="size-4" aria-hidden="true" />
              )}
              {copiedLogs === "all" ? "Copied" : "Copy all logs"}
            </button>
          </div>
          <ol className="mt-3 space-y-2">
            {DOKPLOY_BOOTSTRAP_STEPS.map((step) => {
              const status = bootstrapSteps[step] ?? "waiting";
              const logs = bootstrapLogs[step] ?? [];
              const currentStep = DOKPLOY_BOOTSTRAP_STEPS.find(
                (candidate) => bootstrapSteps[candidate] !== "done",
              );
              const canRun =
                Boolean(provisioningJobId) &&
                step === currentStep &&
                !bootstrapPending;
              return (
                <li key={step} className="text-sm">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        status === "done"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : status === "error"
                            ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                            : status === "running"
                              ? "animate-pulse bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                              : "bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                      }`}
                    >
                      {status === "done"
                        ? "✓"
                        : status === "error"
                          ? "!"
                          : status === "running"
                            ? "…"
                            : ""}
                    </span>
                    <span
                      className={
                        status === "error"
                          ? "text-red-600 dark:text-red-400"
                          : status === "waiting"
                            ? "text-gray-500 dark:text-gray-400"
                            : "text-gray-800 dark:text-gray-200"
                      }
                    >
                      {stepLabels[step]}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!canRun}
                      onClick={() => runSavedStep(step)}
                      className="ml-auto"
                    >
                      {status === "done"
                        ? "Completed"
                        : status === "error"
                          ? "Retry"
                          : status === "running"
                            ? "Running…"
                            : "Run"}
                    </Button>
                    <button
                      type="button"
                      disabled={logs.length === 0}
                      onClick={() => copyProvisioningLogs(step)}
                      aria-label={`Copy ${stepLabels[step]} logs`}
                      title={`Copy ${stepLabels[step]} logs`}
                      className="rounded p-0.5 text-gray-500 hover:bg-white hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
                    >
                      {copiedLogs === step ? (
                        <CheckIcon
                          className="size-4 text-emerald-500"
                          aria-hidden="true"
                        />
                      ) : (
                        <ClipboardDocumentIcon
                          className="size-4"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </div>
                  {logs.length > 0 && (
                    <details
                      className="mt-1 ml-7"
                      open={status === "running" || status === "error"}
                    >
                      <summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-400">
                        Logs ({logs.length})
                      </summary>
                      <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-gray-950 p-2 text-[10px] leading-4 whitespace-pre-wrap text-gray-200">
                        {logs.join("\n")}
                      </pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        </aside>
      )}
    </div>
  );
}
