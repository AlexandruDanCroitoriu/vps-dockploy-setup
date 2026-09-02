"use client";

import { useState, useTransition } from "react";

import { inputClassName } from "@/components/ui/form-field";

export type CloudflareDomainOption = {
  name: string;
  subdomains: string[];
};

function splitHostname(hostname: string, domains: CloudflareDomainOption[]) {
  const normalized = hostname.trim().toLowerCase();
  const domain = [...domains]
    .sort((left, right) => right.name.length - left.name.length)
    .find(
      (candidate) =>
        normalized === candidate.name ||
        normalized.endsWith(`.${candidate.name}`),
    );
  return {
    domain: normalized ? (domain?.name ?? "") : "",
    subdomain: domain
      ? normalized === domain.name
        ? ""
        : normalized.slice(0, -(domain.name.length + 1))
      : "",
  };
}

export function CloudflareHostnameFields({
  name,
  value,
  onChange,
  domains,
  required = false,
  onGenerate,
}: {
  name: string;
  value: string;
  onChange: (hostname: string) => void;
  domains: CloudflareDomainOption[];
  required?: boolean;
  onGenerate?: () => Promise<
    { status: "success"; domain: string } | { status: "error"; message: string }
  >;
}) {
  const { domain, subdomain } = splitHostname(value, domains);
  const [addingSubdomain, setAddingSubdomain] = useState(false);
  const [generated, setGenerated] = useState(
    value.toLowerCase().endsWith(".traefik.me"),
  );
  const [automaticTraefik, setAutomaticTraefik] = useState(generated);
  const [cloudflareHostname, setCloudflareHostname] = useState(
    generated ? "" : value,
  );
  const [generationError, setGenerationError] = useState("");
  const [generationPending, startGeneration] = useTransition();
  const isTraefikHostname =
    generated && value.toLowerCase().endsWith(".traefik.me");

  function update(nextDomain: string, nextSubdomain: string) {
    setGenerated(false);
    setGenerationError("");
    const hostname = nextDomain
      ? nextSubdomain.trim()
        ? `${nextSubdomain.trim().toLowerCase()}.${nextDomain}`
        : nextDomain
      : "";
    setCloudflareHostname(hostname);
    onChange(hostname);
  }

  function toggleAutomaticTraefik(checked: boolean) {
    setGenerationError("");
    setAutomaticTraefik(checked);
    if (!checked) {
      setGenerated(false);
      onChange(cloudflareHostname);
      return;
    }
    if (!onGenerate) return;
    if (!isTraefikHostname) setCloudflareHostname(value);
    startGeneration(async () => {
      const result = await onGenerate();
      if (result.status === "error") {
        setAutomaticTraefik(false);
        setGenerationError(result.message);
        return;
      }
      setGenerated(true);
      onChange(result.domain);
    });
  }

  const selected = domains.find((candidate) => candidate.name === domain);
  const existingSubdomains = selected?.subdomains ?? [];
  const hasExistingSubdomain = existingSubdomains.includes(subdomain);
  const showNewSubdomain =
    Boolean(domain) &&
    (addingSubdomain || (Boolean(subdomain) && !hasExistingSubdomain));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Domain
        <select
          value={domain}
          required={required && !isTraefikHostname}
          disabled={automaticTraefik || generationPending}
          onChange={(event) => update(event.target.value, subdomain)}
          className={inputClassName}
        >
          {!required && <option value="">No domain</option>}
          {domains.map((option) => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Subdomain
        <select
          value={showNewSubdomain ? "__new__" : subdomain}
          disabled={!domain || automaticTraefik || generationPending}
          onChange={(event) => {
            if (event.target.value === "__new__") {
              setAddingSubdomain(true);
              update(domain, "");
              return;
            }
            setAddingSubdomain(false);
            update(domain, event.target.value);
          }}
          className={inputClassName}
        >
          <option value="">Apex domain</option>
          {existingSubdomains.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value="__new__">Add new subdomain…</option>
        </select>
      </label>
      {showNewSubdomain && (
        <label className="text-sm font-medium text-gray-700 sm:col-span-2 dark:text-gray-300">
          New subdomain
          <input
            value={subdomain}
            disabled={automaticTraefik || generationPending}
            autoFocus
            autoComplete="off"
            placeholder="app"
            onChange={(event) => update(domain, event.target.value)}
            className={inputClassName}
          />
        </label>
      )}
      <input type="hidden" name={name} value={value} />
      <input
        type="hidden"
        name={`${name}Provider`}
        value={isTraefikHostname ? "traefik" : "cloudflare"}
      />
      {isTraefikHostname && (
        <p className="text-xs text-emerald-700 sm:col-span-2 dark:text-emerald-300">
          Generated hostname: {value}
        </p>
      )}
      {onGenerate && (
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={automaticTraefik}
              disabled={generationPending}
              onChange={(event) => toggleAutomaticTraefik(event.target.checked)}
            />
            Automatically generate domain with Traefik
          </label>
          {generationPending && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Generating hostname…
            </p>
          )}
          {generationError && (
            <p
              role="alert"
              className="mt-1 text-xs text-red-600 dark:text-red-400"
            >
              {generationError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
