import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  getActiveDokployInstanceSummary,
  getDokployInstanceSummaries,
  getDokployProjects,
  getServiceTypeLabel,
  isDatabaseService,
} from "@/lib/dokploy";
import {
  DashboardShell,
  type SidebarProject,
} from "./_components/dashboard-shell/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const instances = getDokployInstanceSummaries();
  const activeInstance = await getActiveDokployInstanceSummary();
  const [session, result] = await Promise.all([
    getServerSession(authOptions),
    activeInstance
      ? getDokployProjects().then(
          (projects) => ({ projects, error: "" }),
          () => ({ projects: [], error: "Unable to load projects." }),
        )
      : Promise.resolve({ projects: [], error: "" }),
  ]);
  const projects: SidebarProject[] = result.projects.map(
    ({ projectId, name, environments }) => ({
      projectId,
      name,
      services: environments.flatMap((environment) =>
        environment.services.map((service) => ({
          id: service.id,
          type: service.type,
          name: isDatabaseService(service.type)
            ? getServiceTypeLabel(service.type)
            : service.name,
        })),
      ),
    }),
  );
  return (
    <DashboardShell
      key={activeInstance?.id ?? "no-active-instance"}
      initialProjects={projects}
      initialProjectsError={result.error}
      instances={instances}
      activeInstanceId={activeInstance?.id ?? null}
      userName={session?.user?.name || "Administrator"}
    >
      {children}
    </DashboardShell>
  );
}
