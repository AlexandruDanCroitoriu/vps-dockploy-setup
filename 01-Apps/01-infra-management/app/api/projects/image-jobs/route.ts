import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { listImageJobs } from "@/lib/docker/image-jobs";
import { areProjectBuildsEnabled } from "@/lib/repository-workspace";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!areProjectBuildsEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ jobs: listImageJobs() });
}
