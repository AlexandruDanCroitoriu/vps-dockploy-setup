"use client";

import { FolderIcon, HomeIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SidebarProject } from "./dashboard-shell";
import { SidebarProjectTree } from "./sidebar-project-tree";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const navigation = [
  { name: "Dashboard", href: "/", icon: HomeIcon },
  { name: "Projects", href: "/projects", icon: FolderIcon },
] as const;
const classes = (...values: Array<string | false | undefined>) =>
  values.filter(Boolean).join(" ");

export function Sidebar({
  projects,
  projectsError,
  userName,
  onNavigate,
}: {
  projects: SidebarProject[];
  projectsError: string;
  userName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const projectsOpen =
    pathname === "/projects" || pathname.startsWith("/projects/");
  return (
    <div className="flex grow flex-col gap-y-3 overflow-y-auto border-r border-gray-200 bg-white px-4 pb-3 dark:border-white/10 dark:bg-gray-900">
      <div className="flex h-14 shrink-0 items-center">
        <UserMenu userName={userName} />
        <ThemeToggle />
      </div>
      <nav className="flex flex-1 flex-col">
        <ul className="space-y-0.5">
          {navigation.map((item) => {
            const current =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={current ? "page" : undefined}
                  className={classes(
                    current
                      ? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-gray-100"
                      : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5",
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium",
                  )}
                >
                  <item.icon className="size-5 shrink-0" />
                  {item.name}
                </Link>
                {item.href === "/projects" && projectsOpen && (
                  <SidebarProjectTree
                    projects={projects}
                    error={projectsError}
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
