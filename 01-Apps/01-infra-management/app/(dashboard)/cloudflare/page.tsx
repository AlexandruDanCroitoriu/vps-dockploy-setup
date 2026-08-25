import { CloudIcon } from "@heroicons/react/24/outline";

export default function CloudflarePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <CloudIcon className="size-7 text-indigo-500" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Cloudflare
        </h1>
      </div>
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-800/40">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Cloudflare infrastructure management will be available here.
        </p>
      </section>
    </div>
  );
}
