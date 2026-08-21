import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  getDokployProjects,
  getServiceTypeLabel,
  isDatabaseService,
} from "@/lib/dokploy";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await getDokployProjects();

    return Response.json(
      projects.map(({ projectId, name, environments }) => ({
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
      })),
    );
  } catch {
    return Response.json(
      { error: "Unable to load Dokploy projects." },
      { status: 502 },
    );
  }
}
