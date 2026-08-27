import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  getActiveDokployInstanceSummary,
  getFreshDokployProjects,
  getDokployProjects,
  getServiceTypeLabel,
  isDatabaseService,
} from "@/lib/dokploy";
import { getSidebarProjectSnapshot } from "@/lib/dokploy/sidebar-project-snapshot";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instance = await getActiveDokployInstanceSummary();
  if (!instance) {
    return Response.json(
      { error: "No Dockploy instance is selected." },
      { status: 409 },
    );
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  const projectSnapshot = await getSidebarProjectSnapshot(
    instance.id,
    forceRefresh ? getFreshDokployProjects : getDokployProjects,
    {
      forceRefresh,
    },
  );
  const snapshot = {
    ...projectSnapshot,
    projects: projectSnapshot.projects.map(
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
            environmentId: environment.environmentId,
          })),
        ),
      }),
    ),
  };

  if (snapshot.updatedAt === null && snapshot.error) {
    return Response.json(
      { error: "Unable to load Dokploy projects." },
      { status: 502 },
    );
  }

  return Response.json(snapshot, {
    headers: { "cache-control": "private, no-store" },
  });
}
