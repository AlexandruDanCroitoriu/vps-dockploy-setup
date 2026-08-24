"use client";

import Link from "next/link";
import type { SidebarProject } from "./dashboard-shell";

const classes = (...values: Array<string | false | undefined>) =>
  values.filter(Boolean).join(" ");

export function SidebarProjectTree({
  projects,
  error,
  pathname,
  onNavigate,
}: {
  projects: SidebarProject[];
  error: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  if (error)
    return (
      <p role="alert" className="mt-1 pl-8 text-xs text-red-500">
        {error}
      </p>
    );
  if (!projects.length)
    return <p className="mt-1 pl-8 text-xs text-gray-500">No projects</p>;
  return (
    <ul className="mt-0.5 space-y-0.5 pl-7">
      {projects.map((project) => {
        const href = `/dokploy/${encodeURIComponent(project.projectId)}`;
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={project.projectId}>
            <Link
              href={href}
              onClick={onNavigate}
              className={classes(
                current
                  ? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-gray-100"
                  : "text-gray-600 dark:text-gray-400",
                "block truncate rounded-md px-1.5 py-1 text-xs",
              )}
            >
              {project.name}
            </Link>
            {current && project.services.length > 0 && (
              <ul className="pl-3">
                {project.services.map((service) => {
                  const serviceHref = `${href}/services/${encodeURIComponent(service.type)}/${encodeURIComponent(service.id)}`;
                  return (
                    <li key={`${service.type}-${service.id}`}>
                      <Link
                        href={serviceHref}
                        onClick={onNavigate}
                        className={classes(
                          pathname === serviceHref
                            ? "text-indigo-600 dark:text-indigo-300"
                            : "text-gray-500",
                          "block truncate px-1.5 py-1 text-xs",
                        )}
                      >
                        {service.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
