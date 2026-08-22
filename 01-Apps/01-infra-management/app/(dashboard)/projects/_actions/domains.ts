"use server";

import { revalidatePath } from "next/cache";
import {
  createDokployDomain,
  generateDokployDomain,
  getDokployDomainServerIp,
  getDokployDomainServiceNames,
  getDokployRunningContainerOptions,
  getDokployService,
  getDokployServiceStatus,
  isValidHostname,
  isValidPort,
  updateDokployDomain,
  validateDokployDomain,
} from "@/lib/dokploy";
import {
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "./shared";

export async function createDomainAction(
  projectId: string,
  type: "applications" | "compose",
  serviceId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const serviceName = formData.get("serviceName")?.toString().trim() ?? "";
  const host = formData.get("host")?.toString().trim().toLowerCase() ?? "";
  const port = Number(formData.get("port"));
  const service = await getDokployService(projectId, type, serviceId);
  if (!service || !serviceName || !isValidHostname(host) || !isValidPort(port))
    return {
      status: "error",
      message: "Enter a valid service, hostname, and port.",
    };
  const [containerResult, namesResult] = await Promise.allSettled([
    getDokployRunningContainerOptions(service),
    getDokployDomainServiceNames(service),
  ]);
  if (
    containerResult.status === "rejected" &&
    namesResult.status === "rejected"
  ) {
    return {
      status: "error",
      message: "Unable to verify the selected service.",
    };
  }
  const containerOptions =
    containerResult.status === "fulfilled" ? containerResult.value : [];
  const configuredNames =
    namesResult.status === "fulfilled" ? namesResult.value : [];
  const allowedNames = new Set([
    ...containerOptions.map(({ value }) => value),
    ...configuredNames,
    ...(service.type === "applications"
      ? [service.appName || service.name]
      : []),
  ]);
  if (!allowedNames.has(serviceName))
    return { status: "error", message: "Select a valid service." };

  try {
    await createDokployDomain({
      type,
      serviceId: service.id,
      serviceName,
      host,
      port,
      https: formData.get("https") === "on",
      letsEncrypt: formData.get("letsEncrypt") === "on",
    });
    revalidatePath(`/projects/${projectId}/services/${type}/${serviceId}`);
    return { status: "success", message: "Domain created." };
  } catch (error) {
    return getActionError(error, "Unable to create the domain.", "the domain");
  }
}

export async function generateDomainAction(
  projectId: string,
  type: "applications" | "compose",
  serviceId: string,
): Promise<
  | { status: "success"; message: string; domain: string }
  | { status: "error"; message: string }
> {
  if (!(await requireAuthenticatedSession())) {
    return { status: "error", message: SESSION_EXPIRED_STATE.message };
  }
  const service = await getDokployService(projectId, type, serviceId);
  if (!service)
    return { status: "error" as const, message: "Invalid Dokploy service." };
  try {
    const resolved = await getDokployServiceStatus(service);
    const domain = await generateDokployDomain(
      resolved.appName || resolved.name,
      resolved.serverId,
    );
    return { status: "success" as const, message: "Domain generated.", domain };
  } catch (error) {
    const state = getActionError(
      error,
      "Unable to generate a domain.",
      "domain generation",
    );
    return { ...state, status: "error" as const };
  }
}

export async function updateDomainAction(
  projectId: string,
  domainId: string,
  input: {
    host: string;
    port: number;
    serviceName: string;
    https: boolean;
    letsEncrypt: boolean;
  },
): Promise<ActionState> {
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;
  const host = input.host.trim().toLowerCase();
  if (!domainId || !isValidHostname(host) || !isValidPort(input.port))
    return { status: "error", message: "Enter a valid hostname and port." };
  try {
    await updateDokployDomain({ ...input, domainId, host });
    revalidatePath(`/projects/${projectId}`, "layout");
    return { status: "success", message: "Domain updated." };
  } catch (error) {
    return getActionError(
      error,
      "Unable to update the domain.",
      "the domain update",
    );
  }
}

export async function validateDomainAction(
  projectId: string,
  type: "applications" | "compose",
  serviceId: string,
  domain: string,
) {
  if (!(await requireAuthenticatedSession()))
    return { status: "error" as const, message: SESSION_EXPIRED_STATE.message };
  const host = domain.trim().toLowerCase();
  if (!isValidHostname(host))
    return { status: "error" as const, message: "Invalid domain hostname." };
  try {
    const service = await getDokployService(projectId, type, serviceId);
    if (!service)
      return { status: "error" as const, message: "Invalid Dokploy service." };
    const serverIp = await getDokployDomainServerIp(service.serverId);
    return {
      status: "success" as const,
      result: await validateDokployDomain(host, serverIp),
    };
  } catch (error) {
    const state = getActionError(
      error,
      "Unable to validate DNS. Check the Dokploy server IP configuration.",
      "DNS validation",
    );
    return { status: "error" as const, message: state.message };
  }
}
