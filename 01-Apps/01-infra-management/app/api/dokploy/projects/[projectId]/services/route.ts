import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { createApplicationAction } from "@/app/(dashboard)/projects/_actions/applications";
import { createComposeAction } from "@/app/(dashboard)/projects/_actions/composes";
import { createDatabaseAction } from "@/app/(dashboard)/projects/_actions/databases";
import type { ActionState } from "@/app/(dashboard)/projects/_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const formData = await request.formData();
  const creationType = formData.get("creationType")?.toString();
  formData.delete("creationType");

  let result: ActionState;
  if (creationType === "database") {
    result = await createDatabaseAction(projectId, initialState, formData);
  } else if (creationType === "application") {
    result = await createApplicationAction(projectId, initialState, formData);
  } else if (creationType === "compose") {
    const environmentId = formData.get("environmentId")?.toString() ?? "";
    formData.delete("environmentId");
    result = await createComposeAction(
      projectId,
      environmentId,
      initialState,
      formData,
    );
  } else {
    return Response.json(
      { status: "error", message: "Invalid service type." },
      { status: 400 },
    );
  }

  return Response.json(result, { status: result.status === "error" ? 422 : 200 });
}
