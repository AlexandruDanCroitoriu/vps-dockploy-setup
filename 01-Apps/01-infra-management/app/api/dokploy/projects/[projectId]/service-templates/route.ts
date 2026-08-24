import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { createComposeAction } from "@/app/(dashboard)/dokploy/_actions/composes";
import { createDatabaseAction } from "@/app/(dashboard)/dokploy/_actions/databases";
import type { ActionState } from "@/app/(dashboard)/dokploy/_actions/shared";
import {
  getActiveDokployConfiguration,
  getDokployProject,
} from "@/lib/dokploy";

const initialState: ActionState = { status: "idle", message: "" };

type CreatedTemplateService = NonNullable<ActionState["createdService"]> & {
  name: string;
};

function password() {
  return randomBytes(24).toString("base64url");
}

function databaseForm(type: "postgres" | "redis", environmentId: string) {
  const formData = new FormData();
  formData.set("type", type);
  formData.set("environmentId", environmentId);
  formData.set("name", type);
  formData.set("databasePassword", password());
  formData.set("deployAfterCreate", "on");
  if (type === "postgres") {
    formData.set("databaseName", "postgres");
    formData.set("databaseUser", "postgres");
  }
  return formData;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  const payload = (await request.json().catch(() => null)) as {
    templateId?: string;
    garageCapacityGb?: number;
  } | null;
  if (payload?.templateId !== "postgres-redis-dbgate") {
    return Response.json(
      { error: "Invalid service template." },
      { status: 400 },
    );
  }
  const garageCapacityGb = payload.garageCapacityGb ?? 20;
  if (
    !Number.isSafeInteger(garageCapacityGb) ||
    garageCapacityGb < 1 ||
    garageCapacityGb > 1_000_000
  ) {
    return Response.json(
      {
        error: "Garage capacity must be a whole number from 1 to 1,000,000 GB.",
      },
      { status: 400 },
    );
  }

  const project = await getDokployProject(projectId);
  const environment = project?.environments[0];
  if (!project || !environment) {
    return Response.json(
      { error: "The project has no default environment." },
      { status: 409 },
    );
  }

  const existingTypes = new Set(
    environment.services.map((service) => service.type),
  );
  const hasDbGate = environment.services.some(
    (service) =>
      service.type === "compose" && service.name.toLowerCase() === "dbgate",
  );
  const hasGarage = environment.services.some(
    (service) =>
      service.type === "compose" &&
      ["garage", "garage with ui"].includes(service.name.toLowerCase()),
  );
  if (
    existingTypes.has("postgres") ||
    existingTypes.has("redis") ||
    hasDbGate ||
    hasGarage
  ) {
    return Response.json(
      {
        error:
          "This template requires PostgreSQL, Redis, DBGate, and Garage to be absent.",
      },
      { status: 409 },
    );
  }

  const created: CreatedTemplateService[] = [];
  const warnings: string[] = [];
  for (const type of ["postgres", "redis"] as const) {
    const result = await createDatabaseAction(
      projectId,
      initialState,
      databaseForm(type, environment.environmentId),
    );
    if (result.createdService) {
      created.push({ ...result.createdService, name: type });
      if (result.status === "error") warnings.push(result.message);
      continue;
    }
    return Response.json(
      { error: result.message, services: created },
      { status: 422 },
    );
  }

  const configuration = await getActiveDokployConfiguration();
  const composeForm = new FormData();
  composeForm.set("definitionId", "dbgate");
  composeForm.set(
    "loginUsername",
    configuration?.defaultServiceUsername ?? "admin",
  );
  composeForm.set(
    "loginPassword",
    configuration?.defaultServicePassword ?? "admin",
  );
  if (configuration?.rootDomain) {
    composeForm.set("host", `dbgate.${configuration.rootDomain}`);
  }
  composeForm.set("deployAfterCreate", "on");
  const composeResult = await createComposeAction(
    projectId,
    environment.environmentId,
    initialState,
    composeForm,
  );
  if (composeResult.createdService) {
    created.push({ ...composeResult.createdService, name: "DBGate" });
    if (composeResult.status === "error") warnings.push(composeResult.message);
  } else {
    return Response.json(
      { error: composeResult.message, services: created },
      { status: 422 },
    );
  }

  const garageForm = new FormData();
  garageForm.set("definitionId", "garage-with-webui");
  garageForm.set("garageCapacityGb", String(garageCapacityGb));
  garageForm.set(
    "loginUsername",
    configuration?.defaultServiceUsername ?? "admin",
  );
  garageForm.set(
    "loginPassword",
    configuration?.defaultServicePassword ?? password(),
  );
  if (configuration?.rootDomain) {
    garageForm.set("host", `garage.${configuration.rootDomain}`);
  }
  garageForm.set("deployAfterCreate", "on");
  const garageResult = await createComposeAction(
    projectId,
    environment.environmentId,
    initialState,
    garageForm,
  );
  if (garageResult.createdService) {
    created.push({ ...garageResult.createdService, name: "Garage with UI" });
    if (garageResult.status === "error") warnings.push(garageResult.message);
  } else {
    return Response.json(
      { error: garageResult.message, services: created },
      { status: 422 },
    );
  }

  return Response.json({ services: created, warnings });
}
