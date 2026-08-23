"use client";

import {
  ArrowTopRightOnSquareIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  PROJECT_SERVICE_CREATION_EVENT,
  PROJECT_SERVICE_DELETED_EVENT,
  type PendingProjectService,
  type ProjectServiceCreationDetail,
} from "@/lib/project-events";
import { usePeriodicRouterRefresh } from "../use-periodic-router-refresh";

type ExistingService = { id: string; name: string; type: string };

const PendingServicesContext = createContext<PendingProjectService[]>([]);

function matchesExistingService(
  pending: PendingProjectService,
  existing: ExistingService,
) {
  return (
    (pending.serviceId && existing.id === pending.serviceId) ||
    existing.name.toLowerCase() === pending.matchName.toLowerCase() ||
    (["postgres", "mysql", "mariadb", "mongo", "redis"].includes(
      pending.serviceType,
    ) &&
      existing.type === pending.serviceType)
  );
}

export function OptimisticProjectServices({
  projectId,
  existingServices,
  children,
}: {
  projectId: string;
  existingServices: ExistingService[];
  children: ReactNode;
}) {
  const [pendingServices, setPendingServices] = useState<
    PendingProjectService[]
  >([]);
  const [deletedServiceIds, setDeletedServiceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [liveStatuses, setLiveStatuses] = useState<
    Record<string, "running" | "deploying" | "down">
  >({});
  const [liveDomains, setLiveDomains] = useState<
    Record<string, Array<{ domainId: string; host: string; https: boolean }>>
  >({});

  const visibleExistingServices = useMemo(
    () =>
      existingServices.filter((service) => !deletedServiceIds.has(service.id)),
    [deletedServiceIds, existingServices],
  );

  const visiblePendingServices = useMemo(
    () =>
      pendingServices.filter(
        (pending) =>
          !visibleExistingServices.some((existing) =>
            matchesExistingService(pending, existing),
          ),
      ),
    [pendingServices, visibleExistingServices],
  );

  useEffect(() => {
    const settledRequestIds = pendingServices
      .filter((pending) =>
        visibleExistingServices.some((existing) =>
          matchesExistingService(pending, existing),
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
  }, [pendingServices, visibleExistingServices]);

  useEffect(() => {
    function hideDeletedService(event: Event) {
      const detail = (
        event as CustomEvent<{
          projectId: string;
          serviceId: string;
        }>
      ).detail;
      if (detail.projectId !== projectId) return;
      setDeletedServiceIds((current) => {
        if (current.has(detail.serviceId)) return current;
        const next = new Set(current);
        next.add(detail.serviceId);
        return next;
      });
    }

    window.addEventListener(PROJECT_SERVICE_DELETED_EVENT, hideDeletedService);
    return () =>
      window.removeEventListener(
        PROJECT_SERVICE_DELETED_EVENT,
        hideDeletedService,
      );
  }, [projectId]);

  useEffect(() => {
    function updatePendingServices(event: Event) {
      const detail = (event as CustomEvent<ProjectServiceCreationDetail>)
        .detail;
      const eventProjectId =
        detail.phase === "started"
          ? detail.service.projectId
          : detail.projectId;
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

    window.addEventListener(
      PROJECT_SERVICE_CREATION_EVENT,
      updatePendingServices,
    );
    return () =>
      window.removeEventListener(
        PROJECT_SERVICE_CREATION_EVENT,
        updatePendingServices,
      );
  }, [projectId]);

  usePeriodicRouterRefresh(visiblePendingServices.length > 0, 2_000);

  useEffect(() => {
    const createdServices = visiblePendingServices.filter(
      (service) =>
        service.serviceId &&
        liveStatuses[service.requestId] !== "running" &&
        liveStatuses[service.requestId] !== "down",
    );
    if (createdServices.length === 0) return;

    let cancelled = false;
    const loadStatuses = async () => {
      await Promise.all(
        createdServices.map(async (service) => {
          const response = await fetch(
            `/api/dokploy/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(service.serviceType)}/${encodeURIComponent(service.serviceId!)}`,
          );
          if (!response.ok) return;
          const result = (await response.json()) as {
            status?: "running" | "deploying" | "down";
            domains?: Array<{
              domainId: string;
              host: string;
              https: boolean;
            }>;
          };
          if (cancelled || !result.status) return;
          setLiveStatuses((current) =>
            current[service.requestId] === result.status
              ? current
              : { ...current, [service.requestId]: result.status! },
          );
          if (result.domains) {
            setLiveDomains((current) => {
              const previous = current[service.requestId] ?? [];
              return JSON.stringify(previous) === JSON.stringify(result.domains)
                ? current
                : { ...current, [service.requestId]: result.domains! };
            });
          }
        }),
      );
    };

    void loadStatuses();
    const interval = window.setInterval(loadStatuses, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [liveStatuses, projectId, visiblePendingServices]);

  if (
    visiblePendingServices.length === 0 &&
    visibleExistingServices.length === 0
  ) {
    return (
      <p className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
        No services in this project.
      </p>
    );
  }

  return (
    <PendingServicesContext.Provider value={visiblePendingServices}>
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
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${
                      liveStatuses[service.requestId] === "running"
                        ? "bg-emerald-500"
                        : liveStatuses[service.requestId] === "down"
                          ? "bg-red-500"
                          : "animate-pulse bg-amber-400"
                    }`}
                  />
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {service.displayName}
                  </p>
                </div>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {service.typeLabel} ·{" "}
                  {service.serviceId
                    ? liveStatuses[service.requestId] === "running"
                      ? "Running"
                      : liveStatuses[service.requestId] === "down"
                        ? "Down"
                        : "Deploying…"
                    : "Creating…"}
                </p>
                {(liveDomains[service.requestId] ?? []).length > 0 && (
                  <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                    {liveDomains[service.requestId].map((domain) => (
                      <a
                        key={domain.domainId}
                        href={`${domain.https ? "https" : "http"}://${domain.host}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open ${domain.host}`}
                        className="inline-flex min-w-0 items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-500 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200"
                      >
                        <span className="max-w-52 truncate">{domain.host}</span>
                        <ArrowTopRightOnSquareIcon
                          className="size-3 shrink-0"
                          aria-hidden="true"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <span className="size-7 shrink-0 animate-pulse rounded-md bg-gray-100 dark:bg-white/5" />
            </li>
          ))}
        </ul>
      )}
      {children}
    </PendingServicesContext.Provider>
  );
}

export function OptimisticServiceVisibilityGuard({
  service,
  children,
}: {
  service: ExistingService;
  children: ReactNode;
}) {
  const pendingServices = useContext(PendingServicesContext);
  return pendingServices.some((pending) =>
    matchesExistingService(pending, service),
  )
    ? null
    : children;
}
