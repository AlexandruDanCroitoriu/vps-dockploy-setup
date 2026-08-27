import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { authOptions } from "@/auth";
import { ACTIVE_DOKPLOY_COOKIE } from "@/lib/dokploy";
import { invalidateDokployMemoryState } from "@/lib/dokploy/instance-memory-state";
import { clearDokployRenderSnapshots } from "@/lib/dokploy/render-snapshot-cache";
import { clearSidebarProjectSnapshot } from "@/lib/dokploy/sidebar-project-snapshot";
import {
  exportDatabaseState,
  importDatabaseState,
} from "@/lib/storage/database-state";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

async function authenticated() {
  return Boolean((await getServerSession(authOptions))?.user);
}

export async function GET() {
  if (!(await authenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snapshot = exportDatabaseState();
  const date = snapshot.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="infra-management-state-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  if (!(await authenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMPORT_BYTES) {
    return Response.json(
      { error: "The import file is too large." },
      { status: 413 },
    );
  }

  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_IMPORT_BYTES) {
      return Response.json(
        { error: "The import file is too large." },
        { status: 413 },
      );
    }
    const previous = exportDatabaseState();
    const result = importDatabaseState(JSON.parse(text) as unknown);
    const current = exportDatabaseState();
    const instanceIds = new Set(
      [
        ...previous.tables.dokploy_instances,
        ...current.tables.dokploy_instances,
      ]
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string"),
    );
    for (const instanceId of instanceIds) {
      invalidateDokployMemoryState(instanceId);
      clearDokployRenderSnapshots(instanceId);
      clearSidebarProjectSnapshot(instanceId);
    }
    (await cookies()).delete(ACTIVE_DOKPLOY_COOKIE);
    revalidatePath("/", "layout");
    return Response.json({
      success: true,
      message: `Imported ${result.instances} instances and ${result.provisioningJobs} provisioning jobs.`,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "The selected file is not valid JSON."
            : error instanceof Error
              ? error.message
              : "Unable to import the database state.",
      },
      { status: 400 },
    );
  }
}
