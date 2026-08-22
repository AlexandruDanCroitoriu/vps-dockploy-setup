import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { getDokployProject, removeDokployService } from "@/lib/dokploy";

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      projectId: string;
      serviceType: string;
      serviceId: string;
    }>;
  },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, serviceType, serviceId } = await params;
  if (!projectId || !serviceType || !serviceId) {
    return Response.json(
      { error: "Invalid project service." },
      { status: 400 },
    );
  }

  try {
    const project = await getDokployProject(projectId);
    const service = project?.environments
      .flatMap((environment) => environment.services)
      .find(
        (candidate) =>
          candidate.id === serviceId && candidate.type === serviceType,
      );
    if (!service) {
      return Response.json(
        { error: "Project service not found." },
        { status: 404 },
      );
    }
    await removeDokployService(service.type, service.id);
    return Response.json({ success: true });
  } catch {
    return Response.json(
      { error: "Unable to delete the service." },
      { status: 502 },
    );
  }
}
