"use client";

import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { useClickOutside } from "@/components/ui/use-click-outside";
import {
  notifyProjectsChanged,
  notifyProjectServiceCreation,
} from "@/lib/project-events";

const templateServices = [
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

type TemplateServiceKey = (typeof templateServices)[number]["key"];

export function ServiceTemplateDropdown({
  projectId,
  environmentExists,
  services,
}: {
  projectId: string;
  environmentExists: boolean;
  services: Array<{ type: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const ref = useClickOutside<HTMLDivElement>(open, setOpen);
  const router = useRouter();
  const templateUnavailable = services.some(
    (service) =>
      service.type === "postgres" ||
      service.type === "redis" ||
      (service.type === "compose" &&
        ["dbgate", "garage", "garage with ui"].includes(
          service.name.toLowerCase(),
        )),
  );

  async function deployTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const garageCapacityGb = Number(formData.get("garageCapacityGb"));
    setIsCreateOpen(false);
    setError("");
    const requests = new Map(
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
            templateId: "postgres-redis-dbgate",
            garageCapacityGb,
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
        const key: TemplateServiceKey | null =
          service.type === "compose"
            ? ["garage", "garage with ui"].includes(service.name.toLowerCase())
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
      router.refresh();
      notifyProjectsChanged();
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
                setIsCreateOpen(true);
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

      {isCreateOpen && (
        <AppDialog
          open
          onClose={() => setIsCreateOpen(false)}
          title="Add project services"
          description="Create PostgreSQL, Redis, DBGate, and Garage with its WebUI."
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setIsCreateOpen(false)}
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
                Create services
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
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Garage will automatically initialize its single-node layout in the
              local zone with this capacity.
            </p>
          </form>
        </AppDialog>
      )}
    </>
  );
}
