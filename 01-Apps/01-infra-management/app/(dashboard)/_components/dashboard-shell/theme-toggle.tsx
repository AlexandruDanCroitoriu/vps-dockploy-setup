"use client";

import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

export function ThemeToggle() {
  function toggleTheme() {
    const html = document.documentElement;
    const dark = !html.classList.contains("dark");
    html.classList.toggle("dark", dark);
    document.cookie = `theme=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  }
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
    >
      <span className="sr-only">Toggle dark mode</span>
      <MoonIcon className="size-5 dark:hidden" />
      <SunIcon className="hidden size-5 dark:block" />
    </button>
  );
}
