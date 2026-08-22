import "server-only";
import { dokployGet, dokployPost } from "./client";
import { isRecord, normalizeDomains, stringValue } from "./normalizers";
import type { DokployDnsValidation } from "./types";

export async function createDokployDomain(input: {
  type: "applications" | "compose";
  serviceId: string;
  serviceName: string;
  host: string;
  port: number;
  https: boolean;
  letsEncrypt: boolean;
}) {
  await dokployPost("domain.create", {
    host: input.host,
    port: input.port,
    https: input.https,
    certificateType: input.https && input.letsEncrypt ? "letsencrypt" : "none",
    domainType: input.type === "applications" ? "application" : "compose",
    ...(input.type === "applications"
      ? { applicationId: input.serviceId }
      : { composeId: input.serviceId, serviceName: input.serviceName }),
  });
}

export async function generateDokployDomain(
  appName: string,
  serverId?: string | null,
) {
  const payload = await dokployPost<unknown>("domain.generateDomain", {
    appName,
    ...(serverId ? { serverId } : {}),
  });
  if (typeof payload === "string" && payload) return payload;
  if (isRecord(payload))
    for (const field of ["domain", "host", "data"])
      if (typeof payload[field] === "string" && payload[field])
        return payload[field];
  throw new Error("Dokploy returned an invalid generated domain.");
}

export async function getDokployDomains(
  type: "applications" | "compose",
  serviceId: string,
) {
  const query = new URLSearchParams(
    type === "applications"
      ? { applicationId: serviceId }
      : { composeId: serviceId },
  );
  const endpoint =
    type === "applications" ? "domain.byApplicationId" : "domain.byComposeId";
  return normalizeDomains(await dokployGet<unknown>(`${endpoint}?${query}`));
}

export async function getDokployDomainServerIp(serverId?: string | null) {
  if (!serverId) return "";
  const payload = await dokployGet<unknown>(
    `domain.canGenerateTraefikMeDomains?${new URLSearchParams({ serverId })}`,
  );
  return typeof payload === "string" ? payload : "";
}

export async function updateDokployDomain(input: {
  domainId: string;
  host: string;
  port: number;
  serviceName: string;
  https: boolean;
  letsEncrypt: boolean;
}) {
  await dokployPost("domain.update", {
    domainId: input.domainId,
    host: input.host,
    port: input.port,
    serviceName: input.serviceName || null,
    https: input.https,
    certificateType: input.https && input.letsEncrypt ? "letsencrypt" : "none",
  });
}

export async function validateDokployDomain(
  domain: string,
  serverIp?: string,
): Promise<DokployDnsValidation> {
  const payload = await dokployPost<unknown>("domain.validateDomain", {
    domain,
    ...(serverIp ? { serverIp } : {}),
  });
  if (!isRecord(payload))
    throw new Error("Dokploy returned an invalid DNS validation response.");
  return {
    isValid: payload.isValid === true,
    resolvedIp: stringValue(payload.resolvedIp),
    message: stringValue(payload.error),
    cdnProvider: stringValue(payload.cdnProvider),
  };
}
