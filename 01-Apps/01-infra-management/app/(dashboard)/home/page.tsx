import { DatabaseStateControls } from "./database-state-controls";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Home
      </h1>
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-800/40">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Database state
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
          Export all configured Dockploy instances and provisioning state, or
          replace the current database state from a compatible JSON export. The
          file contains plaintext API keys and credentials and must be stored
          securely.
        </p>
        <div className="mt-5">
          <DatabaseStateControls />
        </div>
      </section>
    </div>
  );
}
