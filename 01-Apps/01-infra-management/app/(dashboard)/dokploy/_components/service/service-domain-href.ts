import type { DokployDomain, DokployService } from "@/lib/dokploy";

const VENDURE_BACKEND_PATH = "/01-Apps/02-Online-Store-Vendure/apps/server";

export function getServiceDomainHref(
  service: Pick<DokployService, "type" | "name" | "sourcePath">,
  domain: Pick<DokployDomain, "https" | "host">,
) {
  const origin = `${domain.https ? "https" : "http"}://${domain.host}`;
  const name = service.name.toLowerCase();
  const isVendureBackend =
    service.type === "applications" &&
    (name === "vendure" ||
      name.includes("vendure-server") ||
      service.sourcePath?.toLowerCase() === VENDURE_BACKEND_PATH.toLowerCase());

  return isVendureBackend ? `${origin}/dashboard` : origin;
}
