"use client";

import { ArrowPathIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import type { DokployServiceType } from "@/lib/dokploy";

import { deployServiceAction } from "../../_actions/services";
import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

export function DeployServiceButton({
  projectId,
  serviceId,
  serviceName,
  serviceType,
}: {
  projectId: string;
  serviceId: string;
  serviceName: string;
  serviceType: DokployServiceType;
}) {
  const action = deployServiceAction.bind(
    null,
    projectId,
    serviceType,
    serviceId,
  );
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="relative shrink-0">
      <button
        type="submit"
        disabled={pending}
        title={`Deploy ${serviceName}`}
        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-indigo-300"
      >
        <span className="sr-only">Deploy {serviceName}</span>
        {pending ? (
          <ArrowPathIcon className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RocketLaunchIcon className="size-4" aria-hidden="true" />
        )}
      </button>
      {state.status === "error" && (
        <span className="absolute top-full right-0 z-10 mt-1 w-max max-w-64 rounded bg-red-600 px-2 py-1 text-xs text-white shadow-lg">
          {state.message}
        </span>
      )}
    </form>
  );
}
