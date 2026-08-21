import "server-only";
import { dokployGet, dokployRequest } from "./client";
import { isRecord, normalizeDeployments } from "./normalizers";
import type { DokployService } from "./types";

export async function getDokployDeployments(service: DokployService) {
  if (service.type !== "applications" && service.type !== "compose") return [];
  const query = new URLSearchParams(
    service.type === "applications"
      ? { applicationId: service.id }
      : { composeId: service.id },
  );
  const endpoint =
    service.type === "applications"
      ? "deployment.all"
      : "deployment.allByCompose";
  return normalizeDeployments(
    await dokployGet<unknown>(`${endpoint}?${query}`),
  );
}

export async function getDokployDeploymentLogs(deploymentId: string) {
  const query = new URLSearchParams({ deploymentId, tail: "10000" });
  const text = await (
    await dokployRequest(`deployment.readLogs?${query}`)
  ).text();
  try {
    const payload: unknown = JSON.parse(text);
    if (typeof payload === "string") return payload;
    if (isRecord(payload))
      for (const field of ["logs", "data", "content", "output"])
        if (typeof payload[field] === "string") return payload[field];
  } catch {
    return text;
  }
  return text;
}
