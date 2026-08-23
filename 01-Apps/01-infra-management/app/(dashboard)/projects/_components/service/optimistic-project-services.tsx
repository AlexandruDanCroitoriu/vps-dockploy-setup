"use client";

import { CubeIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import {
  PROJECT_SERVICE_CREATION_EVENT,
  type PendingProjectService,
  type ProjectServiceCreationDetail,
} from "@/lib/project-events";

export function OptimisticProjectServices({
  projectId,
  existingServices,
  children,
}: {
  projectId: string;
  existingServices: Array<{ id: string; name: string }>;
  children: ReactNode;
}) {
  const [pendingServices, setPendingServices] = useState<
    PendingProjectService[]
  >([]);
  const router = useRouter();

  const visiblePendingServices = pendingServices.filter(
    (pending) =>
      !existingServices.some(
        (existing) =>
          (pending.serviceId && existing.id === pending.serviceId) ||
          existing.name === pending.matchName,
      ),
  );

  useEffect(() => {
    const settledRequestIds = pendingServices
      .filter((pending) =>
        existingServices.some(
          (existing) =>
            (pending.serviceId && existing.id === pending.serviceId) ||
            existing.name === pending.matchName,
        ),
      )
      .map((pending) => pending.requestId);
    if (settledRequestIds.length === 0) return;

    queueMicrotask(() => {
      setPendingServices((current) =>
        current.filter(
          (pending) => !settledRequestIds.includes(pending.requestId),
        ),
      );
    });
  }, [existingServices, pendingServices]);

  useEffect(() => {
    function updatePendingServices(event: Event) {
      const detail = (event as CustomEvent<ProjectServiceCreationDetail>).detail;
      const eventProjectId =
        detail.phase === "started" ? detail.service.projectId : detail.projectId;
      if (eventProjectId !== projectId) return;

      setPendingServices((current) => {
        if (detail.phase === "failed") {
          return current.filter(
            (service) => service.requestId !== detail.requestId,
          );
        }
        if (detail.phase === "completed") {
          return current.map((service) =>
            service.requestId === detail.requestId
              ? { ...service, serviceId: detail.serviceId }
              : service,
          );
        }
        return current.some(
          (service) => service.requestId === detail.service.requestId,
        )
          ? current
          : [...current, detail.service];
      });
    }

    window.addEventListener(PROJECT_SERVICE_CREATION_EVENT, updatePendingServices);
    return () =>
      window.removeEventListener(
        PROJECT_SERVICE_CREATION_EVENT,
        updatePendingServices,
      );
  }, [projectId]);

  useEffect(() => {
    if (visiblePendingServices.length === 0) return;
    const refresh = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(refresh);
  }, [visiblePendingServices.length, router]);

  if (
    visiblePendingServices.length === 0 &&
    existingServices.length === 0
  ) {
    return (
      <p className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
        No services in this project.
      </p>
    );
  }

  return (
    <>
      {visiblePendingServices.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {visiblePendingServices.map((service) => (
            <li
              key={service.requestId}
              className="flex min-w-0 items-center gap-2.5 rounded-md border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-gray-900/50"
            >
              <CubeIcon className="size-4 shrink-0 text-indigo-500" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {service.displayName}
                  </p>
                </div>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {service.typeLabel} · Creating…
                </p>
              </div>
              <span className="size-7 shrink-0 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
            </li>
          ))}
        </ul>
      )}
      {children}
    </>
  );
}
