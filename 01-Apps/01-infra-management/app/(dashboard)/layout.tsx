"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  TransitionChild,
} from "@headlessui/react";

import {
  Bars3Icon,
  FolderIcon,
  HomeIcon,
  MoonIcon,
  SunIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { ChevronDownIcon } from "@heroicons/react/20/solid";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: HomeIcon,
  },
  {
    name: "Projects",
    href: "/projects",
    icon: FolderIcon,
  },
  {
    name: "Actions",
    href: "/actions",
    icon: FolderIcon,
  },
] as const;

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function toggleTheme() {
  const html = document.documentElement;
  const newDarkMode = !html.classList.contains("dark");

  html.classList.toggle("dark", newDarkMode);

  document.cookie = `theme=${
    newDarkMode ? "dark" : "light"
  }; path=/; max-age=31536000; samesite=lax`;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-white">
      {/* MOBILE SIDEBAR */}

      <Dialog
        open={sidebarOpen}
        onClose={setSidebarOpen}
        className="relative z-50 lg:hidden"
      >
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="-m-2.5 p-2.5"
                >
                  <span className="sr-only">Close sidebar</span>

                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>

            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4 dark:bg-gray-900 dark:ring dark:ring-white/10">
              <SidebarHeader />

              <SidebarNavigation onNavigate={() => setSidebarOpen(false)} />
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* DESKTOP SIDEBAR */}

      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4 dark:border-white/10 dark:bg-gray-900">
          <SidebarHeader />

          <SidebarNavigation />
        </div>
      </div>

      {/* MAIN AREA */}

      <div className="lg:pl-72">
        {/* MOBILE HEADER */}

        <header className="sticky top-0 z-40 flex h-16 items-center border-b border-gray-200 bg-white px-4 shadow-xs sm:px-6 lg:hidden dark:border-white/10 dark:bg-gray-900 dark:shadow-none">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <span className="sr-only">Open sidebar</span>

            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>

          <div
            aria-hidden="true"
            className="ml-4 h-6 w-px bg-gray-200 dark:bg-white/10"
          />
        </header>

        {/* PAGE CONTENT */}

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

function SidebarHeader() {
  return (
    <div className="flex h-16 shrink-0 items-center">
      {/* USER MENU */}

      <Menu as="div" className="relative mr-auto">
        <MenuButton className="relative flex items-center">
          <span className="absolute -inset-1.5" />

          <span className="sr-only">Open user menu</span>

          <div className="flex size-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
            A
          </div>

          <span className="hidden lg:flex lg:items-center">
            <span
              aria-hidden="true"
              className="ml-4 text-sm/6 font-semibold text-gray-900 dark:text-white"
            >
              Alex
            </span>

            <ChevronDownIcon
              aria-hidden="true"
              className="ml-2 size-5 text-gray-400 dark:text-gray-500"
            />
          </span>
        </MenuButton>

        <MenuItems
          transition
          className="absolute left-0 z-10 mt-2.5 w-36 origin-top-left rounded-md bg-white py-2 shadow-lg outline-1 outline-gray-900/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10"
        >
          <MenuItem>
            <Link
              href="/profile"
              className="block px-3 py-1 text-sm/6 text-gray-900 data-focus:bg-gray-50 data-focus:outline-hidden dark:text-white dark:data-focus:bg-white/5"
            >
              Your profile
            </Link>
          </MenuItem>

          <MenuItem>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="block w-full px-3 py-1 text-left text-sm/6 text-gray-900 data-focus:bg-gray-50 data-focus:outline-hidden dark:text-white dark:data-focus:bg-white/5"
            >
              Sign out
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>

      {/* THEME TOGGLE */}

      <div className="ml-auto flex items-center">
        <button
          type="button"
          onClick={toggleTheme}
          className="-m-2.5 rounded-md p-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-white"
        >
          <span className="sr-only">Toggle dark mode</span>

          <MoonIcon aria-hidden="true" className="size-6 dark:hidden" />

          <SunIcon aria-hidden="true" className="hidden size-6 dark:block" />
        </button>
      </div>
    </div>
  );
}

function SidebarNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col">
      <ul role="list" className="flex flex-1 flex-col">
        <li>
          <ul role="list" className="-mx-2 space-y-1">
            {navigation.map((item) => {
              const isCurrent =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isCurrent ? "page" : undefined}
                    className={classNames(
                      isCurrent
                        ? `bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white`
                        : `text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white`,
                      `group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold`,
                    )}
                  >
                    <item.icon
                      aria-hidden="true"
                      className={classNames(
                        isCurrent
                          ? `text-indigo-600 dark:text-white`
                          : `text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white`,
                        "size-6 shrink-0",
                      )}
                    />

                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      </ul>
    </nav>
  );
}
