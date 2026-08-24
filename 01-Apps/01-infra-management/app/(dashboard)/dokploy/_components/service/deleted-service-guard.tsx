"use client";

import { type ReactNode, useEffect, useState } from "react";

import { PROJECT_SERVICE_DELETED_EVENT } from "@/lib/project-events";
import { usePeriodicRouterRefresh } from "../use-periodic-router-refresh";

export function DeletedServiceGuard({
  projectId,
  serviceId,
  children,
}: {
  projectId: string;
  serviceId: string;
  children: ReactNode;
}) {
  const [deleted, setDeleted] = useState(false);
  usePeriodicRouterRefresh(deleted, 2_000);

  useEffect(() => {
    function handleDeleted(event: Event) {
      const detail = (event as CustomEvent<{
        projectId: string;
        serviceId: string;
      }>).detail;
      if (detail.projectId === projectId && detail.serviceId === serviceId) {
        setDeleted(true);
      }
    }

    window.addEventListener(PROJECT_SERVICE_DELETED_EVENT, handleDeleted);
    return () =>
      window.removeEventListener(PROJECT_SERVICE_DELETED_EVENT, handleDeleted);
  }, [projectId, serviceId]);

  return deleted ? null : children;
}
