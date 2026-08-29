"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import {
  createCloudflareDnsRecord,
  getCloudflareZones,
  invalidateCloudflareZones,
} from "@/lib/cloudflare/zones";
import {
  deployDokployServiceWithConfiguration,
  getDokployProjectsWithConfiguration,
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
  updateDokployProjectEnvWithConfiguration,
  updateDokployServiceEnvWithConfiguration,
} from "@/lib/dokploy";
import { createResendSendingKey } from "@/lib/resend/client";
import {
  createResendDomain,
  getResendDomain,
  listResendDomains,
  verifyResendDomain,
  type ResendDnsRecord,
} from "@/lib/resend/domains";
import { getDokployInstance } from "@/lib/storage/dokploy-instances";

export type ResendSetupState = {
  status: "idle" | "success" | "error";
  message: string;
};

const initialState: ResendSetupState = { status: "idle", message: "" };
const VENDURE_BACKEND_PATH = "/01-Apps/02-Online-Store-Vendure/apps/server";

function isVendureBackend(service: {
  name: string;
  sourcePath: string | null;
}) {
  return (
    service.name.toLowerCase() === "vendure" ||
    service.name.toLowerCase().includes("vendure-server") ||
    service.sourcePath?.toLowerCase() === VENDURE_BACKEND_PATH.toLowerCase()
  );
}

function storefrontUrl(
  rootDomain: string,
  services: readonly {
    name: string;
    sourcePath: string | null;
    status: string;
  }[],
) {
  const storefronts = services.filter(
    (service) =>
      service.sourcePath?.startsWith(
        "/01-Apps/02-Online-Store-Vendure/apps/storefront",
      ) || service.name.toLowerCase().includes("vendure-storefront"),
  );
  const storefront =
    storefronts.find((service) => service.status === "running") ??
    storefronts[0];
  const folder =
    storefront?.sourcePath?.split("/").at(-1) ||
    storefront?.name.toLowerCase().replace(/^.*vendure-/, "") ||
    "storefront";
  return `https://${folder}.${rootDomain}`;
}

function absoluteRecordName(recordName: string, domain: string) {
  const name = recordName.trim().toLowerCase().replace(/\.$/, "");
  const root = domain.toLowerCase();
  if (name === "@" || name === root) return root;
  return name.endsWith(`.${root}`) ? name : `${name}.${root}`;
}

async function ensureDnsRecords(
  zone: Awaited<ReturnType<typeof getCloudflareZones>>[number],
  domain: string,
  records: ResendDnsRecord[],
) {
  const knownRecords = [...zone.subdomains];
  for (const record of records) {
    const name = absoluteRecordName(record.name, domain);
    const exists = knownRecords.some(
      (candidate) =>
        candidate.name.toLowerCase().replace(/\.$/, "") === name &&
        candidate.type === record.type &&
        candidate.content.replace(/^"|"$/g, "") ===
          record.value.replace(/^"|"$/g, ""),
    );
    if (exists) continue;
    await createCloudflareDnsRecord({
      zoneId: zone.id,
      name,
      type: record.type,
      content: record.value,
      proxied: false,
      priority: record.priority,
    });
    knownRecords.push({
      id: `new-${knownRecords.length}`,
      name,
      type: record.type,
      content: record.value,
      proxied: false,
    });
  }

  const dmarcName = `_dmarc.${domain}`;
  if (
    !knownRecords.some(
      (record) =>
        record.name.toLowerCase().replace(/\.$/, "") === dmarcName &&
        record.type === "TXT",
    )
  ) {
    await createCloudflareDnsRecord({
      zoneId: zone.id,
      name: dmarcName,
      type: "TXT",
      content: "v=DMARC1; p=none;",
      proxied: false,
    });
  }
}

export async function configureResendDomainAction(
  instanceId: string,
  _previousState: ResendSetupState = initialState,
): Promise<ResendSetupState> {
  void _previousState;
  if (!(await getServerSession(authOptions))?.user) {
    return { status: "error", message: "Your session has expired." };
  }
  const instance = getDokployInstance(instanceId);
  if (!instance?.rootDomain) {
    return { status: "error", message: "The Dockploy instance was not found." };
  }

  try {
    const rootDomain = instance.rootDomain.toLowerCase();
    const zone = (await getCloudflareZones()).find(
      (candidate) => candidate.name.toLowerCase() === rootDomain,
    );
    if (!zone) {
      return {
        status: "error",
        message: `${rootDomain} is not available in the configured Cloudflare account.`,
      };
    }
    const existing = (await listResendDomains()).find(
      (domain) => domain.name === rootDomain,
    );
    const domain = existing
      ? await getResendDomain(existing.id)
      : await createResendDomain(rootDomain);
    await ensureDnsRecords(zone, rootDomain, domain.records);
    invalidateCloudflareZones();
    await verifyResendDomain(domain.id);

    const configuration = {
      baseUrl: instance.rootUrl,
      apiKey: instance.apiKey,
    };
    const projects = await getDokployProjectsWithConfiguration(configuration);
    let configuredBackends = 0;
    for (const project of projects) {
      const services = project.environments.flatMap(
        (environment) => environment.services,
      );
      const backends = services.filter(
        (service) =>
          service.type === "applications" && isVendureBackend(service),
      );
      if (backends.length === 0) continue;

      const projectEntries = parseDokployEnvironmentEntries(project.env);
      const sendingKey =
        projectEntries.SMTP_PASSWORD ||
        (await createResendSendingKey({
          name: `Vendure ${rootDomain}`,
          domainId: domain.id,
        }));
      const smtpEnvironment = {
        SMTP_HOST: "smtp.resend.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USERNAME: "resend",
        SMTP_PASSWORD: sendingKey,
        MAIL_FROM_ADDRESS: `account@${rootDomain}`,
        MAIL_FROM_NAME: instance.name,
        VENDURE_STOREFRONT_URL: storefrontUrl(rootDomain, services),
      };
      const projectEnvironment = mergeDokployProjectEnv(
        project.env,
        smtpEnvironment,
      );
      if (projectEnvironment !== project.env) {
        await updateDokployProjectEnvWithConfiguration(
          configuration,
          project.projectId,
          projectEnvironment,
        );
      }
      for (const backend of backends) {
        await updateDokployServiceEnvWithConfiguration(
          configuration,
          "applications",
          backend.id,
          mergeDokployProjectEnv(backend.env, smtpEnvironment),
        );
        await deployDokployServiceWithConfiguration(
          configuration,
          "applications",
          backend.id,
        );
        configuredBackends += 1;
      }
    }
    revalidatePath("/resend");
    revalidatePath("/cloudflare");
    return {
      status: "success",
      message:
        configuredBackends > 0
          ? `DNS configured and ${configuredBackends} Vendure backend${configuredBackends === 1 ? "" : "s"} updated for account@${rootDomain}.`
          : `DNS configured for ${rootDomain}. No Vendure backend was found on this instance.`,
    };
  } catch (error) {
    console.error(
      "Resend domain setup failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return {
      status: "error",
      message:
        "Unable to configure the Resend domain. Check the Resend and Cloudflare API tokens.",
    };
  }
}
