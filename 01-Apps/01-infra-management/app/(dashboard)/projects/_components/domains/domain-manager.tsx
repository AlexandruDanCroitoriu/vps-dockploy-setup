"use client";

import { ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useActionState, useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppDialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

import {
  createDomainAction,
  generateDomainAction,
} from "../../_actions/domains";
import type { ActionState } from "../../_actions/shared";
import type { DokployDomain } from "@/lib/dokploy";
import { ConfiguredDomainList } from "./configured-domain-list";

export type DomainConfig = {
  projectId: string;
  serviceId: string;
  serviceType: "applications" | "compose";
  appName: string;
  domains: DokployDomain[];
  serviceNames: string[];
  serviceOptions: Array<{ value: string; label: string }>;
};

const initialState: ActionState = { status: "idle", message: "" };

export function DomainManager({ config }: { config: DomainConfig }) {
  const action = createDomainAction.bind(
    null,
    config.projectId,
    config.serviceType,
    config.serviceId,
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const [https, setHttps] = useState(true);
  const [letsEncrypt, setLetsEncrypt] = useState(true);
  const [hostname, setHostname] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success") return;
    queueMicrotask(() => {
      setOpen(false);
      setHostname("");
      setGenerateError("");
      setHttps(true);
      setLetsEncrypt(true);
      router.refresh();
    });
  }, [router, state]);

  async function generateHostname() {
    setGenerating(true);
    setGenerateError("");

    const result = await generateDomainAction(
      config.projectId,
      config.serviceType,
      config.serviceId,
    );
    if (result.status === "success" && result.domain) {
      setHostname(result.domain);
    } else {
      setGenerateError(result.message);
    }
    setGenerating(false);
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={config.serviceOptions.length === 0}
          title={
            config.serviceOptions.length === 0
              ? "No Compose services were found"
              : "Add domain"
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          New domain
        </button>
      </div>
      <ConfiguredDomainList config={config} />
      <AppDialog open={open} onClose={() => setOpen(false)} title="New domain">
        <form action={formAction} className="p-5">
          <label className="block">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Hostname
            </span>
            <span className="mt-1.5 flex gap-2">
              <input
                name="host"
                type="text"
                required
                autoComplete="off"
                placeholder="app.example.com"
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                className="block h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={generateHostname}
                disabled={generating}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <ArrowPathIcon
                  className={`size-4 ${generating ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {generating ? "Generating…" : "Generate"}
              </button>
            </span>
            {generateError && (
              <span className="mt-1.5 block text-xs text-red-600 dark:text-red-400">
                {generateError}
              </span>
            )}
          </label>

          <div className="mt-4 grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Service
              </span>
              <select
                name="serviceName"
                defaultValue={config.serviceOptions[0]?.value}
                required
                className="mt-1.5 block h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-gray-900 dark:text-white"
              >
                {config.serviceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Port
              </span>
              <input
                name="port"
                type="number"
                required
                min={1}
                max={65535}
                defaultValue={3000}
                className="mt-1.5 block h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-gray-900 dark:text-white"
              />
            </label>
            <div className="space-y-2 pt-0.5 sm:pt-5">
              <Checkbox
                name="https"
                label="HTTPS"
                checked={https}
                onChange={(event) => setHttps(event.target.checked)}
              />
              <Checkbox
                name="letsEncrypt"
                label="Let's Encrypt"
                checked={letsEncrypt}
                onChange={(event) => setLetsEncrypt(event.target.checked)}
                disabled={!https}
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            {state.message && (
              <p
                role="status"
                className={`text-xs ${
                  state.status === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {state.message}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="ml-auto rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create domain"}
            </button>
          </div>
        </form>
      </AppDialog>
    </div>
  );
}
