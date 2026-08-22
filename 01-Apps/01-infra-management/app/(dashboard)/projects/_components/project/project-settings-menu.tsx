"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  Cog6ToothIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";

import {
  deleteProjectAction,
  setProjectServicesStateAction,
} from "../../_actions/projects";
import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

export function ProjectSettingsMenu({
  projectId,
  projectName,
  services,
}: {
  projectId: string;
  projectName: string;
  services: Array<{ id: string; type: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    setProjectServicesStateAction.bind(null, projectId),
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteProjectAction.bind(null, projectId),
    initialState,
  );
  const [submitting, startTransition] = useTransition();
  const [operation, setOperation] = useState<"start" | "stop" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingServiceIds, setDeletingServiceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletedServiceIds, setDeletedServiceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [serviceDeleteErrors, setServiceDeleteErrors] = useState<
    Record<string, string>
  >({});
  const router = useRouter();
  const visibleServices = services.filter(
    (service) => !deletedServiceIds.has(service.id),
  );
  const serviceCount = visibleServices.length;
  const busy = pending || submitting || deletePending;
  const deletingServices = deletingServiceIds.size > 0;

  function updateAllServices(operation: "start" | "stop") {
    setOperation(operation);
    const formData = new FormData();
    formData.set("operation", operation);
    startTransition(() => formAction(formData));
  }

  async function deleteService(serviceId: string, serviceType: string) {
    setDeletingServiceIds((current) => new Set(current).add(serviceId));
    setServiceDeleteErrors((current) => {
      const next = { ...current };
      delete next[serviceId];
      return next;
    });
    try {
      const response = await fetch(
        `/api/dokploy/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceType)}/${encodeURIComponent(serviceId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to delete the service.");
      }
      setDeletedServiceIds((current) => new Set(current).add(serviceId));
      router.refresh();
    } catch (error) {
      setServiceDeleteErrors((current) => ({
        ...current,
        [serviceId]:
          error instanceof Error
            ? error.message
            : "Unable to delete the service.",
      }));
    } finally {
      setDeletingServiceIds((current) => {
        const next = new Set(current);
        next.delete(serviceId);
        return next;
      });
    }
  }

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  useEffect(() => {
    if (deleteState.status !== "success") return;
    queueMicrotask(() => {
      setDeleteOpen(false);
      router.push("/projects");
      router.refresh();
    });
  }, [deleteState.status, router]);

  return (
    <>
      <Menu as="div" className="relative">
        <MenuButton
          disabled={busy}
          title="Project settings"
          className="inline-flex size-10 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
        >
          <span className="sr-only">Project settings</span>
          <Cog6ToothIcon className="size-4" aria-hidden="true" />
        </MenuButton>
        <MenuItems
          anchor="bottom end"
          className="z-50 mt-1 w-52 origin-top-right rounded-md border border-gray-200 bg-white p-1 text-sm shadow-xl transition duration-100 outline-none data-closed:scale-95 data-closed:opacity-0 dark:border-white/10 dark:bg-gray-900"
        >
          <MenuItem>
            <button
              type="button"
              onClick={() => updateAllServices("start")}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-gray-700 disabled:opacity-50 data-focus:bg-emerald-50 data-focus:text-emerald-700 dark:text-gray-300 dark:data-focus:bg-emerald-500/10 dark:data-focus:text-emerald-300"
            >
              <PlayIcon className="size-4" aria-hidden="true" />
              Start all services
            </button>
          </MenuItem>
          <MenuItem>
            <button
              type="button"
              onClick={() => updateAllServices("stop")}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-gray-700 disabled:opacity-50 data-focus:bg-red-50 data-focus:text-red-700 dark:text-gray-300 dark:data-focus:bg-red-500/10 dark:data-focus:text-red-300"
            >
              <StopIcon className="size-4" aria-hidden="true" />
              Stop all services
            </button>
          </MenuItem>
          <div className="my-1 border-t border-gray-200 dark:border-white/10" />
          <MenuItem>
            <button
              type="button"
              onClick={() => {
                setOperation(null);
                setDeleteOpen(true);
              }}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-red-600 disabled:opacity-50 data-focus:bg-red-50 dark:text-red-400 dark:data-focus:bg-red-500/10"
            >
              <TrashIcon className="size-4" aria-hidden="true" />
              Delete project
            </button>
          </MenuItem>
        </MenuItems>
        {state.status === "error" && (
          <span
            role="alert"
            className="absolute top-full right-0 z-50 mt-1 w-max max-w-64 rounded bg-red-600 px-2 py-1 text-xs text-white shadow-lg"
          >
            {state.message}
          </span>
        )}
      </Menu>
      <AppDialog
        open={deleteOpen}
        onClose={() => !busy && !deletingServices && setDeleteOpen(false)}
        title="Delete project?"
        description={`Permanently delete ${projectName}. This action cannot be undone.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => setDeleteOpen(false)}
              disabled={busy || deletingServices}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={`delete-project-${projectId}`}
              variant="danger"
              size="xs"
              disabled={deletePending || deletingServices || serviceCount > 0}
            >
              {deletePending ? "Deleting…" : "Delete project"}
            </Button>
          </div>
        }
      >
        <form
          id={`delete-project-${projectId}`}
          action={deleteAction}
          className="space-y-3 p-4 sm:p-6"
        >
          {serviceCount > 0 ? (
            <div className="space-y-2">
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                Remove the project&apos;s {serviceCount}{" "}
                {serviceCount === 1 ? "service" : "services"} before deleting
                it. Service configuration and Compose volumes will be
                permanently removed.
              </p>
              <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-white/10 dark:border-white/10">
                {visibleServices.map((service) => {
                  const deleting = deletingServiceIds.has(service.id);
                  return (
                    <li
                      key={`${service.type}-${service.id}`}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-800 dark:text-gray-200">
                          {service.name}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {service.type === "applications"
                            ? "Application"
                            : service.type === "compose"
                              ? "Compose"
                              : "Database"}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="danger"
                        size="xs"
                        disabled={busy || deleting}
                        onClick={() => deleteService(service.id, service.type)}
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {Object.entries(serviceDeleteErrors).map(([serviceId, error]) => (
                <p
                  key={serviceId}
                  className="text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {error}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              The empty project and its environments will be permanently removed
              from Dokploy.
            </p>
          )}
          {deleteState.status === "error" && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {deleteState.message}
            </p>
          )}
        </form>
      </AppDialog>
      {busy && operation && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-white/75 backdrop-blur-[1px] dark:bg-gray-950/70"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-lg dark:border-white/10 dark:bg-gray-900 dark:text-gray-200">
            <svg
              className="size-4 animate-spin text-indigo-500"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            {operation === "start"
              ? "Starting all services…"
              : "Stopping all services…"}
          </span>
        </div>
      )}
    </>
  );
}
