"use client";

import { actionTest } from "@/app/actions/actionTest";

export default function Actions() {
  async function testAction() {
    await actionTest();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
        Actions
      </h1>
      <button
        type="button"
        className="mt-6 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-400"
        onClick={testAction}
      >
        test
      </button>

      <form
        action={testAction}
        className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5"
      >
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-400"
        >
          Test
        </button>
      </form>
    </div>
  );
}
