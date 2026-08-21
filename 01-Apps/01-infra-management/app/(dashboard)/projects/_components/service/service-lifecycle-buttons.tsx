"use client";

import {
  ArrowPathIcon,
  RocketLaunchIcon,
  StopIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";

import type { DokployServiceStatus, DokployServiceType } from "@/lib/dokploy";

import {
  deployServiceAction,
  reloadServiceAction,
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
}: {
  projectId: string;
  serviceId: string;
  serviceName: string;
  appName: string;
  serviceType: DokployServiceType;
  status: DokployServiceStatus;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <ServiceActionButton
        action={deployServiceAction.bind(
          null,
          projectId,
          serviceType,
          serviceId,
        )}
        disabled={status === "deploying"}
        label={`Deploy ${serviceName}`}
        hoverClass="hover:bg-gray-100 hover:text-indigo-600 dark:hover:text-indigo-300"
        icon={<RocketLaunchIcon className="size-4" aria-hidden="true" />}
      />
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
        action={stopServiceAction.bind(null, projectId, serviceType, serviceId)}
        disabled={status !== "running"}
        label={`Stop ${serviceName}`}
        hoverClass="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-300"
        icon={<StopIcon className="size-4" aria-hidden="true" />}
      />
    </div>
  );
}
