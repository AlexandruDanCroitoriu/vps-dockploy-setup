"use client";

import { FormEvent, useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

function toggleTheme() {
  const html = document.documentElement;
  const newDarkMode = !html.classList.contains("dark");

  html.classList.toggle("dark", newDarkMode);
  document.cookie = `theme=${newDarkMode ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
}

export default function LoginPage() {
  const router = useRouter();

  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPending(true);
    setError("");

    const formData = new FormData(event.currentTarget);

    const username = formData.get("username");
    const password = formData.get("password");

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      setError("Invalid username or password.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 px-4 py-12 text-gray-900 sm:px-6 dark:bg-gray-900 dark:text-white">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-indigo-500/50 to-transparent"
      />

      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-5 right-5 rounded-md p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:top-6 sm:right-6 dark:hover:bg-white/5 dark:hover:text-white dark:focus-visible:outline-indigo-400"
      >
        <span className="sr-only">Toggle dark mode</span>
        <MoonIcon aria-hidden="true" className="size-6 dark:hidden" />
        <SunIcon aria-hidden="true" className="hidden size-6 dark:block" />
      </button>

      <div className="animate-page-in w-full max-w-md">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-gray-800"
        >
          <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight text-indigo-600 dark:text-indigo-400">
            Sign in to your dashboard
          </h1>

          <div>
            <label
              htmlFor="username"
              className="block text-sm/6 font-medium text-gray-900 dark:text-white"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs outline-none placeholder:text-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-indigo-500 dark:focus:ring-indigo-500"
            />
          </div>

          <div className="mt-5">
            <label
              htmlFor="password"
              className="block text-sm/6 font-medium text-gray-900 dark:text-white"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs outline-none placeholder:text-gray-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-indigo-500 dark:focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-6 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-400"
          >
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
