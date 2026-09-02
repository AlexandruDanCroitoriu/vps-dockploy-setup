"use client";

import {
  CloudIcon,
  CircleStackIcon,
  FolderIcon,
  HomeIcon,
  ServerIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DokployInstanceSummary } from "@/lib/storage/dokploy-instances";
import { DokployInstanceSelector } from "./dokploy-instance-selector";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const classes = (...values: Array<string | false | undefined>) =>
  values.filter(Boolean).join(" ");

export function Sidebar({
  instances,
  activeInstanceId,
  dokployAvailable,
  projectBuildsEnabled,
  userName,
  onNavigate,
}: {
  instances: DokployInstanceSummary[];
  activeInstanceId: string | null;
  dokployAvailable: boolean;
  projectBuildsEnabled: boolean;
  userName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const navigation = [
    { name: "Home", href: "/", icon: HomeIcon },
    { name: "Cloudflare", href: "/cloudflare", icon: CloudIcon },
    { name: "R2 Storage", href: "/r2", icon: CircleStackIcon },
    ...(projectBuildsEnabled
      ? [{ name: "Projects", href: "/projects", icon: FolderIcon } as const]
      : []),
  ] as const;
  return (
    <div className="flex grow flex-col gap-y-3 overflow-y-auto border-r border-gray-200 bg-white px-4 pb-3 dark:border-white/10 dark:bg-gray-900">
      <div className="flex h-14 shrink-0 items-center pt-3">
        <UserMenu userName={userName} />
        <ThemeToggle />
      </div>
      <nav aria-label="Infrastructure" className="shrink-0">
        <ul className="space-y-0.5">
          {navigation.map((item) => {
            const current =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(`${item.href}/`));
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
              </li>
            );
          })}
        </ul>
      </nav>
      <hr className="border-0 border-t border-gray-200 dark:border-white/10" />
      <DokployInstanceSelector
        instances={instances}
        activeInstanceId={activeInstanceId}
        onNavigate={onNavigate}
      />
      <nav aria-label="Instance" className="shrink-0">
        <Link
          href="/instance"
          onClick={onNavigate}
          aria-current={pathname === "/instance" ? "page" : undefined}
          className={classes(
            pathname === "/instance"
              ? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-gray-100"
              : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5",
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium",
          )}
        >
          <ServerIcon className="size-5 shrink-0" aria-hidden="true" />
          Instance
        </Link>
      </nav>
      <nav aria-label="Dokploy" className="flex flex-1 flex-col">
        {dokployAvailable && (
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/dokploy"
                onClick={onNavigate}
                aria-current={
                  pathname === "/dokploy" || pathname.startsWith("/dokploy/")
                    ? "page"
                    : undefined
                }
                className={classes(
                  pathname === "/dokploy" || pathname.startsWith("/dokploy/")
                    ? "bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-gray-100"
                    : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5",
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium",
                )}
              >
                <FolderIcon className="size-5 shrink-0" />
                Dokploy
              </Link>
            </li>
          </ul>
        )}
      </nav>
    </div>
  );
}
