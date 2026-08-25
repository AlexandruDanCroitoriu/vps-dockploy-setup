import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { warmActiveDokployInstanceCache } from "@/lib/dokploy/warm-instance-cache";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await warmActiveDokployInstanceCache();
  return Response.json(
    { status: "ready" },
    { headers: { "cache-control": "private, no-store" } },
  );
}
