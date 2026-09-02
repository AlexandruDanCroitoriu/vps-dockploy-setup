"use client";

import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { DokployInstanceSummary } from "@/lib/storage/dokploy-instances";
import { Sidebar } from "./sidebar";

export function DashboardShell({
  children,
  instances,
  activeInstanceId,
  dokployAvailable,
  projectBuildsEnabled,
  userName,
}: {
  children: React.ReactNode;
  instances: DokployInstanceSummary[];
  activeInstanceId: string | null;
  dokployAvailable: boolean;
  projectBuildsEnabled: boolean;
  userName: string;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-300">
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
              instances={instances}
              activeInstanceId={activeInstanceId}
              dokployAvailable={dokployAvailable}
              projectBuildsEnabled={projectBuildsEnabled}
              userName={userName}
              onNavigate={() => setSidebarOpen(false)}
            />
          </DialogPanel>
        </div>
      </Dialog>
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-56 lg:flex-col">
        <Sidebar
          instances={instances}
          activeInstanceId={activeInstanceId}
          dokployAvailable={dokployAvailable}
          projectBuildsEnabled={projectBuildsEnabled}
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
