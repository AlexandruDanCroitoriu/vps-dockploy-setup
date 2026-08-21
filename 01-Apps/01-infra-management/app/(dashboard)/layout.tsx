import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
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
  const [session, result] = await Promise.all([
    getServerSession(authOptions),
    getDokployProjects().then(
      (projects) => ({ projects, error: "" }),
      () => ({ projects: [], error: "Unable to load projects." }),
    ),
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
      initialProjects={projects}
      initialProjectsError={result.error}
      userName={session?.user?.name || "Administrator"}
    >
      {children}
    </DashboardShell>
  );
}
