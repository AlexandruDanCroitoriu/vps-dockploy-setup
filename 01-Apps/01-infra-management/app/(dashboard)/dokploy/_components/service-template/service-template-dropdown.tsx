"use client";

import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { useClickOutside } from "@/components/ui/use-click-outside";
import { notifyProjectServiceCreation } from "@/lib/project-events";
import {
  CloudflareHostnameFields,
  type CloudflareDomainOption,
} from "../domains/cloudflare-hostname-fields";
import { generateComposeDomainAction } from "../../_actions/composes";

const infrastructureTemplateServices = [
  {
    key: "postgres",
    matchName: "postgres",
    displayName: "PostgreSQL",
    typeLabel: "PostgreSQL",
    serviceType: "postgres",
  },
  {
    key: "redis",
    matchName: "redis",
    displayName: "Redis",
    typeLabel: "Redis",
    serviceType: "redis",
  },
  {
    key: "dbgate",
    matchName: "DBGate",
    displayName: "DBGate",
    typeLabel: "Compose",
    serviceType: "compose",
  },
  {
    key: "garage",
    matchName: "Garage with UI",
    displayName: "Garage with UI",
    typeLabel: "Compose",
    serviceType: "compose",
  },
] as const;

const vendureTemplateServices = [
  {
    key: "postgres",
    matchName: "postgres",
    displayName: "PostgreSQL",
    typeLabel: "PostgreSQL",
    serviceType: "postgres",
  },
  {
    key: "garage",
    matchName: "Garage with UI",
    displayName: "Garage with UI",
    typeLabel: "Compose",
    serviceType: "compose",
  },
  {
    key: "vendure",
    matchName: "vendure",
    displayName: "Vendure",
    typeLabel: "Application",
    serviceType: "applications",
  },
  {
    key: "storefront-clean",
    matchName: "vendure-storefront-clean",
    displayName: "Vendure storefront-clean",
    typeLabel: "Application",
    serviceType: "applications",
  },
  {
    key: "storefront",
    matchName: "vendure-storefront",
    displayName: "Vendure storefront",
    typeLabel: "Application",
    serviceType: "applications",
  },
] as const;

type TemplateId = "postgres-redis-dbgate" | "vendure-stack";
type TemplateService =
  | (typeof infrastructureTemplateServices)[number]
  | (typeof vendureTemplateServices)[number];

export function ServiceTemplateDropdown({
  projectId,
  environmentExists,
  rootDomain,
  cloudflareDomains = [],
  services,
  r2Buckets = [],
}: {
  projectId: string;
  environmentExists: boolean;
  rootDomain: string;
  cloudflareDomains?: CloudflareDomainOption[];
  services: Array<{ type: string; name: string }>;
  r2Buckets?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(
    null,
  );
  const [error, setError] = useState("");
  const [garageS3Host, setGarageS3Host] = useState(
    rootDomain ? `s3.${rootDomain}` : "",
  );
  const ref = useClickOutside<HTMLDivElement>(open, setOpen);
  const templateUnavailable = services.some(
    (service) =>
      service.type === "postgres" ||
      service.type === "redis" ||
      (service.type === "compose" &&
        ["dbgate", "garage", "garage with ui"].includes(
          service.name.toLowerCase(),
        )),
  );
  const vendureTemplateUnavailable = services.some(
    (service) =>
      service.type === "postgres" ||
      (service.type === "compose" &&
        ["garage", "garage with ui"].includes(service.name.toLowerCase())) ||
      (service.type === "applications" &&
        ["vendure", "vendure-storefront", "vendure-storefront-clean"].includes(
          service.name.toLowerCase(),
        )),
  );

  async function deployTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const garageCapacityGb = Number(formData.get("garageCapacityGb"));
    const garageS3Host = String(formData.get("garageS3Host") ?? "");
    const garageS3HostProvider = String(
      formData.get("garageS3HostProvider") ?? "cloudflare",
    );
    const r2BackupBucket = String(formData.get("r2BackupBucket") ?? "");
    const r2BackupPrefix = String(formData.get("r2BackupPrefix") ?? "");
    const r2BackupTime = String(formData.get("r2BackupTime") ?? "");
    const templateId = selectedTemplate;
    if (!templateId) return;
    const templateServices: readonly TemplateService[] =
      templateId === "vendure-stack"
        ? vendureTemplateServices
        : infrastructureTemplateServices;
    setSelectedTemplate(null);
    setError("");
    const requests = new Map<string, string>(
      templateServices.map((service) => [service.key, crypto.randomUUID()]),
    );
    for (const service of templateServices) {
      notifyProjectServiceCreation({
        phase: "started",
        service: {
          requestId: requests.get(service.key)!,
          projectId,
          matchName: service.matchName,
          displayName: service.displayName,
          typeLabel: service.typeLabel,
          serviceType: service.serviceType,
        },
      });
    }

    try {
      const response = await fetch(
        `/api/dokploy/projects/${encodeURIComponent(projectId)}/service-templates`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            templateId,
            garageCapacityGb,
            garageS3Host,
            garageS3HostProvider,
            r2BackupBucket,
            r2BackupPrefix,
            r2BackupTime,
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        warnings?: string[];
        services?: Array<{ id: string; type: string; name: string }>;
      };
      const createdKeys = new Set<string>();
      for (const service of result.services ?? []) {
        const key =
          templateId === "vendure-stack" && service.type === "applications"
            ? service.name.toLowerCase() === "vendure"
              ? "vendure"
              : service.name.toLowerCase().replace(/^vendure-/, "")
            : service.type === "compose"
              ? ["garage", "garage with ui"].includes(
                  service.name.toLowerCase(),
                )
                ? "garage"
                : "dbgate"
              : service.type === "postgres" || service.type === "redis"
                ? service.type
                : null;
        if (!key) continue;
        const requestId = requests.get(key);
        if (!requestId) continue;
        createdKeys.add(key);
        notifyProjectServiceCreation({
          phase: "completed",
          projectId,
          requestId,
          serviceId: service.id,
        });
      }
      for (const service of templateServices) {
        if (createdKeys.has(service.key)) continue;
        notifyProjectServiceCreation({
          phase: "failed",
          projectId,
          requestId: requests.get(service.key)!,
        });
      }
      if (!response.ok || result.warnings?.length) {
        setError(
          result.error ||
            result.warnings?.join(" ") ||
            "Template deployment failed.",
        );
      }
    } catch {
      for (const requestId of requests.values()) {
        notifyProjectServiceCreation({ phase: "failed", projectId, requestId });
      }
      setError("Unable to reach the service template endpoint.");
    }
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={!environmentExists}
          title={
            environmentExists
              ? "Add services from a template"
              : "Create a project environment before adding a template"
          }
          aria-expanded={open}
          className="inline-flex items-center rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Add service template</span>
          <Squares2X2Icon className="size-4" aria-hidden="true" />
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900">
            <p className="border-b border-gray-200 px-3 py-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:border-white/10 dark:text-gray-400">
              Service templates
            </p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSelectedTemplate("postgres-redis-dbgate");
              }}
              disabled={templateUnavailable}
              className="block w-full px-3 py-3 text-left hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-indigo-500/10"
            >
              <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                PostgreSQL + Redis + DBGate + Garage
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {templateUnavailable
                  ? "Remove existing PostgreSQL, Redis, DBGate, or Garage services first."
                  : "Creates both databases, DBGate, and Garage with its authenticated WebUI."}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSelectedTemplate("vendure-stack");
              }}
              disabled={vendureTemplateUnavailable}
              className="block w-full border-t border-gray-200 px-3 py-3 text-left hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:hover:bg-indigo-500/10"
            >
              <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                Complete Vendure stack
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {vendureTemplateUnavailable
                  ? "Remove existing PostgreSQL, Garage, or Vendure services first."
                  : "Creates PostgreSQL, Garage, the Vendure backend, and both storefronts."}
              </span>
            </button>
          </div>
        )}

        {error && (
          <span
            role="alert"
            className="absolute top-full right-0 z-40 mt-1 w-80 rounded-md bg-red-600 px-3 py-2 text-xs text-white shadow-lg"
          >
            {error}
          </span>
        )}
      </div>

      {selectedTemplate && (
        <AppDialog
          open
          onClose={() => setSelectedTemplate(null)}
          title={
            selectedTemplate === "vendure-stack"
              ? "Deploy complete Vendure stack"
              : "Add project services"
          }
          description={
            selectedTemplate === "vendure-stack"
              ? "Create PostgreSQL, Garage, the Vendure backend, and both storefronts."
              : "Create PostgreSQL, Redis, DBGate, and Garage with its WebUI."
          }
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                variant="secondary"
                size="xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-service-template-form"
                size="xs"
              >
                {selectedTemplate === "vendure-stack"
                  ? "Deploy Vendure stack"
                  : "Create services"}
              </Button>
            </div>
          }
        >
          <form
            id="create-service-template-form"
            onSubmit={deployTemplate}
            className="space-y-3 p-4 sm:p-6"
          >
            <FormField
              label="Garage storage capacity (GB)"
              htmlFor="garage-capacity-gb"
            >
              <input
                id="garage-capacity-gb"
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
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                label="R2 backup bucket"
                htmlFor="template-r2-backup-bucket"
              >
                <select
                  id="template-r2-backup-bucket"
                  name="r2BackupBucket"
                  required
                  defaultValue=""
                  className={inputClassName}
                >
                  <option value="" disabled>
                    Select a bucket
                  </option>
                  {r2Buckets.map((bucket) => (
                    <option key={bucket} value={bucket}>
                      {bucket}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Backup folder"
                htmlFor="template-r2-backup-prefix"
              >
                <input
                  id="template-r2-backup-prefix"
                  name="r2BackupPrefix"
                  required
                  defaultValue="garage"
                  className={inputClassName}
                />
              </FormField>
              <FormField
                label="Daily backup time"
                htmlFor="template-r2-backup-time"
              >
                <input
                  id="template-r2-backup-time"
                  name="r2BackupTime"
                  type="time"
                  required
                  defaultValue="03:00"
                  className={inputClassName}
                />
              </FormField>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Garage will automatically initialize its single-node layout in the
              local zone with this capacity.
            </p>
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                Garage S3 API domain hostname
              </p>
              <CloudflareHostnameFields
                name="garageS3Host"
                value={garageS3Host}
                onChange={setGarageS3Host}
                domains={cloudflareDomains}
                required
                onGenerate={() =>
                  generateComposeDomainAction("garage-with-webui", "s3")
                }
              />
            </div>
          </form>
        </AppDialog>
      )}
    </>
  );
}
