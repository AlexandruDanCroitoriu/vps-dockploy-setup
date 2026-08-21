"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { signOut } from "next-auth/react";

export function UserMenu({ userName }: { userName: string }) {
  const initial = userName.trim().charAt(0).toUpperCase() || "A";
  return (
    <Menu as="div" className="relative mr-auto">
      <MenuButton className="flex items-center">
        <span className="flex size-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="ml-3 max-w-28 truncate text-sm font-medium">
          {userName}
        </span>
        <ChevronDownIcon className="ml-1.5 size-4 text-gray-400" />
      </MenuButton>
      <MenuItems
        transition
        className="absolute left-0 z-10 mt-2 w-32 rounded-md bg-white py-1 shadow-lg outline-1 outline-gray-900/5 dark:bg-gray-800 dark:outline-white/10"
      >
        <MenuItem>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="block w-full px-3 py-1.5 text-left text-xs data-focus:bg-gray-50 dark:data-focus:bg-white/5"
          >
            Sign out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
