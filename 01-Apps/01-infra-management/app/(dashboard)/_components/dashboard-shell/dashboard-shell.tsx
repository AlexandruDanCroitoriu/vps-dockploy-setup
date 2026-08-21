"use client";

import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PROJECTS_CHANGED_EVENT } from "@/lib/project-events";
import { Sidebar } from "./sidebar";

export type SidebarProject = {
  projectId: string;
  name: string;
  services: Array<{ id: string; type: string; name: string }>;
};

export function DashboardShell({
  children,
  initialProjects,
  initialProjectsError,
  userName,
}: {
  children: React.ReactNode;
  initialProjects: SidebarProject[];
  initialProjectsError: string;
  userName: string;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projects, setProjects] = useState(initialProjects);
  const [projectsError, setProjectsError] = useState(initialProjectsError);

  useEffect(() => {
    let controller: AbortController | null = null;
    async function reloadProjects() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/dokploy/projects", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const payload: unknown = await response.json();
        if (!isSidebarProjects(payload)) throw new Error();
        setProjects(payload);
        setProjectsError("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setProjectsError("Unable to load projects.");
      }
    }
    window.addEventListener(PROJECTS_CHANGED_EVENT, reloadProjects);
    return () => {
      controller?.abort();
      window.removeEventListener(PROJECTS_CHANGED_EVENT, reloadProjects);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-white">
      <Dialog
        open={sidebarOpen}
        onClose={setSidebarOpen}
        className="relative z-50 lg:hidden"
      >
        <DialogBackdrop className="fixed inset-0 bg-gray-900/80" />
        <div className="fixed inset-0 flex">
          <DialogPanel className="relative mr-16 flex w-full max-w-56 flex-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 left-full ml-4 p-2 text-white"
            >
              <span className="sr-only">Close sidebar</span>
              <XMarkIcon className="size-6" aria-hidden="true" />
            </button>
            <Sidebar
              projects={projects}
              projectsError={projectsError}
              userName={userName}
              onNavigate={() => setSidebarOpen(false)}
            />
          </DialogPanel>
        </div>
      </Dialog>
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-56 lg:flex-col">
        <Sidebar
          projects={projects}
          projectsError={projectsError}
          userName={userName}
        />
      </div>
      <div className="lg:pl-56">
        <header className="sticky top-0 z-40 flex h-16 items-center border-b border-gray-200 bg-white px-4 lg:hidden dark:border-white/10 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-m-2.5 p-2.5 text-gray-700 dark:text-gray-400"
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="size-6" aria-hidden="true" />
          </button>
        </header>
        <main className="min-h-[calc(100vh-2rem)] bg-white py-4 lg:min-h-screen dark:bg-gray-900">
          <div className="px-4 sm:px-6 lg:px-8">
            <div key={pathname} className="animate-page-in">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function isSidebarProjects(value: unknown): value is SidebarProject[] {
  return (
    Array.isArray(value) &&
    value.every(
      (project) =>
        typeof project === "object" &&
        project !== null &&
        "projectId" in project &&
        typeof project.projectId === "string" &&
        "name" in project &&
        typeof project.name === "string" &&
        "services" in project &&
        Array.isArray(project.services),
    )
  );
}
