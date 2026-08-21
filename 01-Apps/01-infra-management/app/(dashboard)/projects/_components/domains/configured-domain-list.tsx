"use client";

import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import type { DokployDomain } from "@/lib/dokploy";
import {
  updateDomainAction,
  validateDomainAction,
} from "../../_actions/domains";
import type { DomainConfig } from "./domain-manager";

export function ConfiguredDomainList({ config }: { config: DomainConfig }) {
  if (config.domains.length === 0) return null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-800/40">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
        Configured domains
      </h2>
      <div className="mt-3 space-y-2">
        {config.domains.map((domain) => (
          <DomainRow key={domain.domainId} domain={domain} config={config} />
        ))}
      </div>
    </section>
  );
}

function DomainRow({
  domain,
  config,
}: {
  domain: DokployDomain;
  config: DomainConfig;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState("");
  const [dns, setDns] = useState<{
    valid: boolean;
    detail: string;
    resolvedIp: string;
  } | null>(null);

  async function validateDns() {
    setValidating(true);
    const response = await validateDomainAction(
      config.projectId,
      config.serviceType,
      config.serviceId,
      domain.host,
    );
    if (response.status === "success") {
      const result = response.result;
      setDns({
        valid: result.isValid,
        resolvedIp: result.resolvedIp,
        detail:
          result.message || result.cdnProvider || "DNS resolves correctly.",
      });
    } else {
      setDns({ valid: false, detail: response.message, resolvedIp: "" });
    }
    setValidating(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const result = await updateDomainAction(config.projectId, domain.domainId, {
      host: data.get("host")?.toString() || "",
      port: Number(data.get("port")),
      serviceName: data.get("serviceName")?.toString() || "",
      https: data.get("https") === "on",
      letsEncrypt: data.get("letsEncrypt") === "on",
    });
    setMessage(result.message);
    if (result.status === "success") setEditing(false);
    setSaving(false);
  }

  const assignedService =
    config.serviceOptions.find((option) => option.value === domain.serviceName)
      ?.label ||
    domain.serviceName ||
    config.appName;

  return (
    <div className="rounded-md border border-gray-200 p-3 dark:border-white/10">
      {editing ? (
        <form onSubmit={save}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.65fr)_7rem]">
            <label className="block">
              <span className="mb-1 block text-[11px] text-gray-500">
                Hostname
              </span>
              <input
                name="host"
                defaultValue={domain.host}
                required
                autoFocus
                className="h-9 w-full rounded-md border border-gray-300 bg-transparent px-2.5 text-sm dark:border-white/10"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-gray-500">
                Service
              </span>
              <select
                name="serviceName"
                defaultValue={
                  domain.serviceName || config.serviceOptions[0]?.value
                }
                className="h-9 w-full rounded-md border border-gray-300 bg-transparent px-2.5 text-sm dark:border-white/10"
              >
                {domain.serviceName &&
                  !config.serviceOptions.some(
                    (option) => option.value === domain.serviceName,
                  ) && (
                    <option value={domain.serviceName}>
                      {domain.serviceName} (not running)
                    </option>
                  )}
                {config.serviceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-gray-500">Port</span>
              <input
                name="port"
                type="number"
                min={1}
                max={65535}
                defaultValue={domain.port}
                required
                className="h-9 w-full rounded-md border border-gray-300 bg-transparent px-2.5 text-sm dark:border-white/10"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-gray-200 pt-3 dark:border-white/10">
            <label className="flex items-center gap-2 text-xs">
              <input
                name="https"
                type="checkbox"
                defaultChecked={domain.https}
              />{" "}
              HTTPS
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                name="letsEncrypt"
                type="checkbox"
                defaultChecked={domain.letsEncrypt}
              />{" "}
              Let&apos;s Encrypt
            </label>
            <span className="flex-1" />
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="block max-w-full truncate text-left text-sm font-medium text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-300"
                aria-expanded={false}
              >
                {domain.host}
              </button>
              <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
                {assignedService}
              </p>
            </div>
            <span className="text-xs text-gray-500">:{domain.port}</span>
            <button
              type="button"
              onClick={validateDns}
              disabled={validating}
              className={`rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-60 ${dns?.valid ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : dns ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300" : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"}`}
            >
              {validating
                ? "Validating…"
                : dns?.valid && dns.resolvedIp
                  ? `Valid · ${dns.resolvedIp}`
                  : dns
                    ? "DNS invalid"
                    : "Validate DNS"}
            </button>
          </div>
          {dns && (
            <p
              className={`mt-2 flex items-center gap-1.5 text-xs ${dns.valid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            >
              {dns.valid && <CheckCircleIcon className="size-4 shrink-0" />}
              {dns.detail}
            </p>
          )}
        </>
      )}
      {message && (
        <p className="mt-2 text-xs text-gray-500" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
