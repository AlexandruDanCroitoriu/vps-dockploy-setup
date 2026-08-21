import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  getDokployDeploymentLogs,
  getDokployDeploymentStatus,
} from "@/lib/dokploy";
import {
  decorateDeploymentLogs,
  formatDeploymentLogView,
} from "@/lib/logs/deployment-logs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deploymentId } = await params;

  try {
    const searchParams = new URL(request.url).searchParams;
    const serviceId = searchParams.get("serviceId") ?? "";
    const serviceType = searchParams.get("serviceType");
    const statusPromise =
      serviceId && (serviceType === "applications" || serviceType === "compose")
        ? getDokployDeploymentStatus(
            serviceType,
            serviceId,
            deploymentId,
          ).catch(() => "unknown")
        : Promise.resolve("unknown");
    const [logs, deploymentStatus] = await Promise.all([
      getDokployDeploymentLogs(deploymentId),
      statusPromise,
    ]);
    const view = searchParams.get("view");
    const filteredLogs = formatDeploymentLogView(logs, view);
    const output =
      searchParams.get("pretty") === "1"
        ? decorateDeploymentLogs(filteredLogs)
        : filteredLogs;
    return new Response(
      output || "No stored log output is available for this deployment.\n",
      {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-deployment-status": deploymentStatus,
        },
      },
    );
  } catch {
    return new Response("Unable to load deployment logs.\n", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
