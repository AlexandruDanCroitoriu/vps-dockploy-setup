"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  ArrowPathIcon,
  Cog6ToothIcon,
  PlayIcon,
  RocketLaunchIcon,
  StopIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import type { DokployServiceStatus, DokployServiceType } from "@/lib/dokploy";
import { notifyProjectsChanged } from "@/lib/project-events";

import {
  deployServiceAction,
  reloadServiceAction,
  startServiceAction,
  stopServiceAction,
} from "../../_actions/services";
import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

type LifecycleAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

function ServiceActionButton({
  action,
  disabled,
  icon,
  label,
  hoverClass,
}: {
  action: LifecycleAction;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  hoverClass: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <form action={formAction} className="relative shrink-0">
      <button
        type="submit"
        disabled={disabled || pending}
        title={label}
        className={`rounded-md p-1.5 text-gray-400 transition-colors disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/5 ${hoverClass}`}
      >
        <span className="sr-only">{label}</span>
        {pending ? (
          <ArrowPathIcon className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
      </button>
      {state.status === "error" && (
        <span
          role="alert"
          className="absolute top-full right-0 z-20 mt-1 w-max max-w-64 rounded bg-red-600 px-2 py-1 text-xs text-white shadow-lg"
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

export function ServiceLifecycleButtons({
  projectId,
  serviceId,
  serviceName,
  appName,
  serviceType,
  status,
  compactMenu = false,
  deleteRedirectHref,
}: {
  projectId: string;
  serviceId: string;
  serviceName: string;
  appName: string;
  serviceType: DokployServiceType;
  status: DokployServiceStatus;
  compactMenu?: boolean;
  deleteRedirectHref?: string;
}) {
  const deployButton = (
    <ServiceActionButton
      action={deployServiceAction.bind(null, projectId, serviceType, serviceId)}
      disabled={status === "deploying"}
      label={`Deploy ${serviceName}`}
      hoverClass="hover:bg-gray-100 hover:text-indigo-600 dark:hover:text-indigo-300"
      icon={<RocketLaunchIcon className="size-4" aria-hidden="true" />}
    />
  );

  if (compactMenu) {
    return (
      <CompactServiceMenu
        projectId={projectId}
        serviceId={serviceId}
        serviceName={serviceName}
        appName={appName}
        serviceType={serviceType}
        status={status}
        deleteRedirectHref={deleteRedirectHref}
      />
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {deployButton}
      <ServiceActionButton
        action={reloadServiceAction.bind(
          null,
          projectId,
          serviceType,
          serviceId,
          appName,
        )}
        disabled={status !== "running" || !appName}
        label={`Reload ${serviceName}`}
        hoverClass="hover:bg-gray-100 hover:text-sky-600 dark:hover:text-sky-300"
        icon={<ArrowPathIcon className="size-4" aria-hidden="true" />}
      />
      <ServiceActionButton
        action={
          status === "running"
            ? stopServiceAction.bind(null, projectId, serviceType, serviceId)
            : startServiceAction.bind(null, projectId, serviceType, serviceId)
        }
        disabled={status === "deploying"}
        label={`${status === "running" ? "Stop" : "Start"} ${serviceName}`}
        hoverClass={
          status === "running"
            ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
            : "hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
        }
        icon={
          status === "running" ? (
            <StopIcon className="size-4" aria-hidden="true" />
          ) : (
            <PlayIcon className="size-4" aria-hidden="true" />
          )
        }
      />
    </div>
  );
}

function CompactServiceMenu({
  projectId,
  serviceId,
  serviceName,
  appName,
  serviceType,
  status,
  deleteRedirectHref,
}: {
  projectId: string;
  serviceId: string;
  serviceName: string;
  appName: string;
  serviceType: DokployServiceType;
  status: DokployServiceStatus;
  deleteRedirectHref?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const isRunning = status === "running";

  function runLifecycle(action: LifecycleAction) {
    setError("");
    startTransition(async () => {
      const result = await action(initialState, new FormData());
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      router.refresh();
      notifyProjectsChanged();
    });
  }

  async function deleteService() {
    setDeleting(true);
    setError("");
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
      setDeleteOpen(false);
      if (deleteRedirectHref) router.push(deleteRedirectHref);
      else router.refresh();
      notifyProjectsChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to delete the service.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Menu as="div" className="relative shrink-0">
        <MenuButton
          disabled={pending || deleting}
          title={`Settings for ${serviceName}`}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/5 dark:hover:text-gray-200"
        >
          <span className="sr-only">Settings for {serviceName}</span>
          {pending ? (
            <ArrowPathIcon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Cog6ToothIcon className="size-4" aria-hidden="true" />
          )}
        </MenuButton>
        <MenuItems
          anchor="bottom end"
          className="z-50 mt-1 w-48 rounded-md border border-gray-200 bg-white p-1 text-sm shadow-xl outline-none dark:border-white/10 dark:bg-gray-900"
        >
          <MenuItem>
            <button
              type="button"
              disabled={pending || status === "deploying"}
              onClick={() =>
                runLifecycle(
                  deployServiceAction.bind(
                    null,
                    projectId,
                    serviceType,
                    serviceId,
                  ),
                )
              }
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-gray-700 disabled:opacity-40 data-focus:bg-gray-100 dark:text-gray-300 dark:data-focus:bg-white/5"
            >
              <RocketLaunchIcon
                className="size-4 text-indigo-500"
                aria-hidden="true"
              />
              Deploy service
            </button>
          </MenuItem>
          <MenuItem>
            <button
              type="button"
              disabled={pending || status === "deploying"}
              onClick={() =>
                runLifecycle(
                  isRunning
                    ? stopServiceAction.bind(
                        null,
                        projectId,
                        serviceType,
                        serviceId,
                      )
                    : startServiceAction.bind(
                        null,
                        projectId,
                        serviceType,
                        serviceId,
                      ),
                )
              }
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-gray-700 disabled:opacity-40 data-focus:bg-gray-100 dark:text-gray-300 dark:data-focus:bg-white/5"
            >
              {isRunning ? (
                <StopIcon className="size-4 text-red-500" aria-hidden="true" />
              ) : (
                <PlayIcon
                  className="size-4 text-emerald-500"
                  aria-hidden="true"
                />
              )}
              {isRunning ? "Stop service" : "Start service"}
            </button>
          </MenuItem>
          <MenuItem>
            <button
              type="button"
              disabled={pending || !isRunning || !appName}
              onClick={() =>
                runLifecycle(
                  reloadServiceAction.bind(
                    null,
                    projectId,
                    serviceType,
                    serviceId,
                    appName,
                  ),
                )
              }
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-gray-700 disabled:opacity-40 data-focus:bg-gray-100 dark:text-gray-300 dark:data-focus:bg-white/5"
            >
              <ArrowPathIcon
                className="size-4 text-sky-500"
                aria-hidden="true"
              />
              Reload service
            </button>
          </MenuItem>
          <div className="my-1 border-t border-gray-200 dark:border-white/10" />
          <MenuItem>
            <button
              type="button"
              disabled={pending || status === "deploying"}
              onClick={() => setDeleteOpen(true)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-red-600 disabled:opacity-40 data-focus:bg-red-50 dark:text-red-400 dark:data-focus:bg-red-500/10"
            >
              <TrashIcon className="size-4" aria-hidden="true" />
              Delete service
            </button>
          </MenuItem>
        </MenuItems>
        {error && !deleteOpen && (
          <span
            role="alert"
            className="absolute top-full right-0 z-50 mt-1 w-max max-w-64 rounded bg-red-600 px-2 py-1 text-xs text-white shadow-lg"
          >
            {error}
          </span>
        )}
      </Menu>
      <AppDialog
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title={`Delete ${serviceName}?`}
        description="This permanently removes the service from Dokploy. Compose volumes are deleted with Compose services."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="xs"
              onClick={deleteService}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete service"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 p-4 sm:p-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This action cannot be undone.
          </p>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </AppDialog>
    </>
  );
}
