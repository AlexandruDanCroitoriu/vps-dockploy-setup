"use client";

import {
  CheckIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  type FormEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { ActionMessage, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  createDokployInstanceAction,
  resolveDokployVpsIpAction,
  selectDokployInstanceAction,
  updateDokployInstanceAction,
} from "../../_actions/dokploy-instances";
import type { ActionState } from "../../dokploy/_actions/shared";
import {
  DOKPLOY_BOOTSTRAP_STEPS,
  type DokployBootstrapStep,
  type DokployBootstrapStepStatus,
} from "@/lib/vps/bootstrap-progress";
import type { DokployProvisioningJob } from "@/lib/storage/dokploy-provisioning";

const initialState: ActionState = { status: "idle", message: "" };
const stepLabels: Record<DokployBootstrapStep, string> = {
  connecting: "Connecting to VPS",
  updating: "Updating and upgrading operating system",
  installing: "Installing Dokploy",
  starting: "Waiting for Dokploy to start",
  administrator: "Creating Dokploy administrator",
  "api-key": "Generating API/CLI key",
  domain: "Configuring HTTPS domain",
  verifying: "Verifying Dokploy connection",
  zot: "Creating and deploying Zot registry",
};

export function DokployInstanceForm({
  instance,
  provisioningJob = null,
  newInstanceDefaults = { username: "admin", password: "admin" },
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
}) {
  const isEditing = Boolean(instance);
  const [instanceName, setInstanceName] = useState(instance?.name ?? provisioningJob?.name ?? "");
  const [rootDomain, setRootDomain] = useState(instance?.rootDomain ?? provisioningJob?.rootDomain ?? "");
  const [vpsIp, setVpsIp] = useState(instance?.vpsIp ?? provisioningJob?.vpsIp ?? "");
  const [apiKey, setApiKey] = useState(instance?.apiKey ?? provisioningJob?.apiKey ?? "");
  const [defaultServiceUsername, setDefaultServiceUsername] = useState(
    instance?.defaultServiceUsername ??
      provisioningJob?.defaultServiceUsername ??
      newInstanceDefaults.username,
  );
  const [defaultServicePassword, setDefaultServicePassword] = useState(
    instance?.defaultServicePassword ??
      provisioningJob?.defaultServicePassword ??
      newInstanceDefaults.password,
  );
  const [vpsIpError, setVpsIpError] = useState("");
  const [vpsIpPending, startVpsIpResolution] = useTransition();
  const vpsIpRequestRef = useRef(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState<
    DokployBootstrapStep | "all" | null
  >(null);
  const [bootstrapPending, setBootstrapPending] = useState(provisioningJob?.status === "running");
  const [bootstrapError, setBootstrapError] = useState(provisioningJob?.error ?? "");
  const [bootstrapSteps, setBootstrapSteps] = useState<
    Partial<Record<DokployBootstrapStep, DokployBootstrapStepStatus>>
  >(provisioningJob?.steps ?? {});
  const [bootstrapLogs, setBootstrapLogs] = useState<
    Partial<Record<DokployBootstrapStep, string[]>>
  >(provisioningJob?.logs ?? {});
  const [provisioningJobId, setProvisioningJobId] = useState(provisioningJob?.id ?? "");
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const dockployUrl = rootDomain.trim()
    ? `https://dockploy.${rootDomain.trim().toLowerCase().replace(/\.$/, "")}`
    : "";
  const action = instance
    ? updateDokployInstanceAction.bind(null, instance.id)
    : createDokployInstanceAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const resetNewInstanceForm = useCallback(() => {
    vpsIpRequestRef.current += 1;
    formRef.current?.reset();
    setInstanceName("");
    setRootDomain("");
    setVpsIp("");
    setApiKey("");
    setDefaultServiceUsername(newInstanceDefaults.username);
    setDefaultServicePassword(newInstanceDefaults.password);
    setVpsIpError("");
    setShowApiKey(false);
    setApiKeyCopied(false);
    setCopiedLogs(null);
    setBootstrapPending(false);
    setBootstrapError("");
    setBootstrapSteps({});
    setBootstrapLogs({});
    setProvisioningJobId("");
  }, [newInstanceDefaults.password, newInstanceDefaults.username]);

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
      const response = await fetch(`/api/dokploy-instances/bootstrap?id=${encodeURIComponent(provisioningJobId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const job = (await response.json()) as DokployProvisioningJob;
      setBootstrapSteps(job.steps);
      setBootstrapLogs(job.logs);
      setApiKey(job.apiKey);
      setBootstrapError(job.error);
      if (job.status === "complete" && job.instanceId) {
        window.clearInterval(interval);
        const selected = await selectDokployInstanceAction(job.instanceId);
        if (selected.status !== "error") {
          resetNewInstanceForm();
          router.replace("/");
          router.refresh();
        }
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
  }, [bootstrapPending, provisioningJobId, resetNewInstanceForm, router]);

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
    const domain = rootDomain.trim();
    if (!domain) return;
    const requestDomain = domain;
    const timeout = window.setTimeout(() => {
      startVpsIpResolution(async () => {
        const result = await resolveDokployVpsIpAction(requestDomain);
        if (vpsIpRequestRef.current !== requestId) return;
        if (result.status === "success") {
          setVpsIp(result.ipAddress);
          setVpsIpError("");
        } else {
          setVpsIp("");
          setVpsIpError(result.message);
        }
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [rootDomain]);

  async function submitBootstrap(event: FormEvent<HTMLFormElement>) {
    if (isEditing || !vpsIp) return;
    event.preventDefault();
    setBootstrapPending(true);
    setBootstrapError("");
    setBootstrapSteps({});
    setBootstrapLogs({});
    setApiKey("");
    let activeJobId = provisioningJobId;
    let reconnectingToPersistedJob = false;
    try {
      const response = await fetch("/api/dokploy-instances/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: instanceName,
          rootDomain,
          ipAddress: vpsIp,
          defaultServiceUsername,
          defaultServicePassword,
        }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message || "Unable to start VPS setup.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let completedInstanceId = "";
      while (true) {
        const { done, value } = await reader.read();
        buffered += decoder.decode(value, { stream: !done });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const update = JSON.parse(line) as {
            type:
              | "step"
              | "log"
              | "heartbeat"
              | "job"
              | "credential"
              | "complete"
              | "failed";
            step?: DokployBootstrapStep;
            status?: DokployBootstrapStepStatus;
            message?: string;
            instanceId?: string;
            apiKey?: string;
            jobId?: string;
          };
          if (update.type === "step" && update.step && update.status) {
            setBootstrapSteps((current) => ({
              ...current,
              [update.step!]: update.status,
            }));
          } else if (update.type === "log" && update.step && update.message) {
            setBootstrapLogs((current) => {
              const existing = current[update.step!] ?? [];
              if (existing.at(-1) === update.message) return current;
              return {
                ...current,
                [update.step!]: [...existing, update.message!].slice(-200),
              };
            });
          } else if (update.type === "failed") {
            throw new Error(update.message || "VPS setup failed.");
          } else if (update.type === "credential" && update.apiKey) {
            setApiKey(update.apiKey);
          } else if (update.type === "job" && update.jobId) {
            activeJobId = update.jobId;
            setProvisioningJobId(update.jobId);
            router.refresh();
          } else if (update.type === "complete" && update.instanceId) {
            completedInstanceId = update.instanceId;
          }
        }
        if (done) break;
      }
      if (!completedInstanceId) throw new Error("VPS setup did not complete.");
      const selected = await selectDokployInstanceAction(completedInstanceId);
      if (selected.status === "error") throw new Error(selected.message);
      resetNewInstanceForm();
      router.replace("/");
      router.refresh();
    } catch (error) {
      if (error instanceof TypeError && activeJobId) {
        reconnectingToPersistedJob = true;
        setProvisioningJobId(activeJobId);
        setBootstrapPending(true);
        setBootstrapError(
          "The live setup connection was interrupted. Reconnecting to the saved VPS setup progress…",
        );
        return;
      }
      setBootstrapSteps((current) => {
        const running = DOKPLOY_BOOTSTRAP_STEPS.find(
          (step) => current[step] === "running",
        );
        return running ? { ...current, [running]: "error" } : current;
      });
      setBootstrapError(
        error instanceof Error
            ? error.message
            : "VPS setup failed.",
      );
    } finally {
      if (!reconnectingToPersistedJob) setBootstrapPending(false);
    }
  }

  return (
    <div className={!isEditing ? "mt-5 grid gap-5 lg:grid-cols-2" : "mt-5"}>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={submitBootstrap}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-4">
            <FormField label="Root domain" htmlFor="dockploy-root-domain">
              <Input
                id="dockploy-root-domain"
                name="rootDomain"
                required
                maxLength={253}
                autoComplete="off"
                placeholder="example.com"
                value={rootDomain}
                onChange={(event) => {
                  const value = event.target.value;
                  setRootDomain(value);
                  if (!value.trim()) {
                    setVpsIp("");
                    setVpsIpError("");
                  }
                }}
              />
            </FormField>
            <FormField label="VPS IP address" htmlFor="dockploy-vps-ip">
              <Input
                id="dockploy-vps-ip"
                name="ipAddress"
                autoComplete="off"
                placeholder={vpsIpPending ? "Resolving…" : "203.0.113.10"}
                value={vpsIp}
                readOnly
                tabIndex={-1}
                className="cursor-default bg-gray-50 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400"
              />
              {vpsIpError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {vpsIpError}
                </p>
              )}
            </FormField>
          </div>
          <FormField label="Dockploy URL" htmlFor="dockploy-root-url">
            <Input
              id="dockploy-root-url"
              name="rootUrl"
              type="url"
              value={dockployUrl}
              readOnly
              tabIndex={-1}
              aria-describedby="dockploy-root-url-help"
              className="cursor-default bg-gray-50 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400"
            />
            <p
              id="dockploy-root-url-help"
              className="mt-1 text-xs text-gray-500 dark:text-gray-400"
            >
              Generated automatically from the root domain.
            </p>
          </FormField>
        </div>
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
              onChange={(event) => setApiKey(event.target.value)}
              readOnly={!isEditing}
              className={`pr-20 ${showApiKey ? "" : "[-webkit-text-security:disc]"} ${!isEditing ? "cursor-default bg-gray-50 dark:bg-gray-900/50" : ""}`}
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
            Generated automatically during VPS setup. It can be changed when
            editing the saved instance.
            </p>
          )}
        </FormField>
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
                onChange={(event) =>
                  setDefaultServiceUsername(event.target.value)
                }
              />
            </FormField>
            <FormField
              label="Default password"
              htmlFor="default-service-password"
            >
              <Input
                id="default-service-password"
                name="defaultServicePassword"
                type="text"
                required
                maxLength={255}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={defaultServicePassword}
                onChange={(event) =>
                  setDefaultServicePassword(event.target.value)
                }
              />
            </FormField>
          </div>
        </fieldset>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="md"
            disabled={pending || bootstrapPending}
          >
            {pending || bootstrapPending
              ? "Verifying…"
              : provisioningJobId && bootstrapError
                ? "Restart VPS setup"
              : instance
                ? "Verify and save changes"
                : "Verify and add Dockploy"}
          </Button>
        </div>
      </form>
      {!isEditing && (
        <aside className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-gray-900/40">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              VPS setup progress
            </h3>
            <button
              type="button"
              disabled={!Object.values(bootstrapLogs).some((logs) => logs?.length)}
              onClick={() => copyProvisioningLogs("all")}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
            >
              {copiedLogs === "all" ? (
                <CheckIcon className="size-4 text-emerald-500" aria-hidden="true" />
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
                    <button
                      type="button"
                      disabled={logs.length === 0}
                      onClick={() => copyProvisioningLogs(step)}
                      aria-label={`Copy ${stepLabels[step]} logs`}
                      title={`Copy ${stepLabels[step]} logs`}
                      className="ml-auto rounded p-0.5 text-gray-500 hover:bg-white hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
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
