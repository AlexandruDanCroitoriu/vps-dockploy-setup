import { getActiveDokployConfiguration } from "@/lib/dokploy";
import { DokployInstanceForm } from "./_components/dokploy-instances/dokploy-instance-form";
import { DeleteDokployInstanceButton } from "./_components/dokploy-instances/delete-dokploy-instance-button";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ addDockploy?: string | string[] }>;
}) {
  const activeInstance = await getActiveDokployConfiguration();
  const query = await searchParams;
  const addingInstance = !activeInstance || query.addDockploy === "1";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Dashboard
      </h1>

      <section className="relative mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-800/40">
        {!addingInstance && activeInstance && (
          <DeleteDokployInstanceButton
            instanceId={activeInstance.id}
            instanceName={activeInstance.name}
          />
        )}
        <h2 className="pr-10 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {addingInstance
            ? "Add a Dockploy instance"
            : "Edit Dockploy instance"}
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {addingInstance
            ? "The connection is verified before its settings are stored."
            : "Changes are verified before the instance is updated."}
        </p>
        <DokployInstanceForm
          key={addingInstance ? "new" : activeInstance?.id}
          instance={
            addingInstance || !activeInstance
              ? null
              : {
                  id: activeInstance.id,
                  name: activeInstance.name,
                  rootUrl: activeInstance.rootUrl,
                  rootDomain: activeInstance.rootDomain,
                  apiKey: activeInstance.apiKey,
                  defaultServiceUsername: activeInstance.defaultServiceUsername,
                  defaultServicePassword: activeInstance.defaultServicePassword,
                }
          }
        />
      </section>
    </div>
  );
}
