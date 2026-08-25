"use client";

import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import type { SidebarProject } from "@/lib/dokploy/sidebar-project-types";

const classes = (...values: Array<string | false | undefined>) =>
  values.filter(Boolean).join(" ");

export function SidebarProjectTree({
  projects,
  error,
  pathname,
  dokployRootUrl,
  onNavigate,
}: {
  projects: SidebarProject[];
  error: string;
  pathname: string;
  dokployRootUrl: string;
  onNavigate?: () => void;
}) {
  if (!projects.length)
    return (
      <p className="mt-1 pl-8 text-xs text-gray-500">
        {error || "No projects"}
      </p>
    );
  return (
    <>
      {error && (
        <p role="alert" className="mt-1 pl-8 text-xs text-red-500">
          {error}
        </p>
      )}
      <ul className="mt-0.5 space-y-0.5 pl-7">
        {projects.map((project) => {
          const href = `/dokploy/${encodeURIComponent(project.projectId)}`;
          const externalProjectHref = `${dokployRootUrl}/dashboard/project/${encodeURIComponent(project.projectId)}`;
          const current = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={project.projectId}>
              <div
                className={classes(
                  current
                    ? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-gray-100"
                    : "text-gray-600 dark:text-gray-400",
                  "flex items-center rounded-md",
                )}
              >
                <Link
                  href={href}
                  onClick={onNavigate}
                  className="min-w-0 flex-1 truncate px-1.5 py-1 text-xs"
                >
                  {project.name}
                </Link>
                <ExternalLink
                  href={externalProjectHref}
                  label={`Open ${project.name} in Dokploy`}
                />
              </div>
              {project.services.length > 0 && (
                <ul className="pl-3">
                  {project.services.map((service) => {
                    const serviceHref = `${href}/services/${encodeURIComponent(service.type)}/${encodeURIComponent(service.id)}`;
                    const externalType =
                      service.type === "applications"
                        ? "application"
                        : service.type;
                    const externalServiceHref = `${externalProjectHref}/environment/${encodeURIComponent(service.environmentId)}/services/${externalType}/${encodeURIComponent(service.id)}`;
                    return (
                      <li
                        key={`${service.type}-${service.id}`}
                        className="flex items-center"
                      >
                        <Link
                          href={serviceHref}
                          onClick={onNavigate}
                          className={classes(
                            pathname === serviceHref
                              ? "text-indigo-600 dark:text-indigo-300"
                              : "text-gray-500",
                            "min-w-0 flex-1 truncate px-1.5 py-1 text-xs",
                          )}
                        >
                          {service.name}
                        </Link>
                        <ExternalLink
                          href={externalServiceHref}
                          label={`Open ${service.name} in Dokploy`}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-white/10 dark:hover:text-indigo-300"
    >
      <ArrowTopRightOnSquareIcon className="size-3.5" aria-hidden="true" />
    </a>
  );
}
