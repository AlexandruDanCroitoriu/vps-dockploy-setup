"use server";

import { revalidatePath } from "next/cache";
import {
  deployDokployService,
  getActiveDokployConfiguration,
  getFreshDokployProjects,
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
  updateDokployProjectEnv,
  updateDokployServiceEnv,
} from "@/lib/dokploy";
import { provisionResendDomain } from "@/lib/resend/provisioning";
import {
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  type ActionState,
} from "../dokploy/_actions/shared";

const VENDURE_BACKEND_PATH = "/01-Apps/02-Online-Store-Vendure/apps/server";
const STOREFRONT_PATH_PREFIX =
  "/01-Apps/02-Online-Store-Vendure/apps/storefront";

function storefrontUrl(
  rootDomain: string,
  services: readonly { name: string; sourcePath: string | null }[],
) {
  const storefront = services.find(
    (service) =>
      service.sourcePath === STOREFRONT_PATH_PREFIX ||
      service.name.toLowerCase() === "vendure-storefront",
  );
  const folder =
    storefront?.sourcePath?.split("/").at(-1) ||
    storefront?.name.toLowerCase().replace(/^vendure-/, "") ||
    "storefront";
  return `https://${folder}.${rootDomain}`;
}

export async function configureResendAction(
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  void formData;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  try {
    const instance = await getActiveDokployConfiguration();
    if (!instance)
      return { status: "error", message: "Select a Dockploy instance first." };
    const projects = await getFreshDokployProjects();
    const vendureProjects = projects.flatMap((project) => {
      const applications = project.environments
        .flatMap((environment) => environment.services)
        .filter((service) => service.type === "applications");
      const backends = applications.filter(
        (service) =>
          service.sourcePath?.toLowerCase() ===
            VENDURE_BACKEND_PATH.toLowerCase() ||
          service.name.toLowerCase() === "vendure",
      );
      return backends.length ? [{ project, applications, backends }] : [];
    });
    if (!vendureProjects.length) {
      return {
        status: "error",
        message: "No Vendure backend is deployed on this instance.",
      };
    }

    let configured = 0;
    for (const { project, applications, backends } of vendureProjects) {
      const current = parseDokployEnvironmentEntries(project.env);
      const { sendingKey } = await provisionResendDomain(
        instance.rootDomain,
        current.SMTP_PASSWORD,
      );
      const emailEntries = {
        SMTP_HOST: "smtp.resend.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USERNAME: "resend",
        SMTP_PASSWORD: sendingKey,
        MAIL_FROM_ADDRESS: `account@${instance.rootDomain}`,
        MAIL_FROM_NAME: instance.name,
        VENDURE_STOREFRONT_URL: storefrontUrl(
          instance.rootDomain,
          applications,
        ),
        VENDURE_STOREFRONT_CLEAN_URL: `https://storefront-clean.${instance.rootDomain}`,
      };
      const projectEnvironment = mergeDokployProjectEnv(
        project.env,
        emailEntries,
      );
      if (projectEnvironment !== project.env) {
        await updateDokployProjectEnv(project.projectId, projectEnvironment);
      }
      for (const backend of backends) {
        await updateDokployServiceEnv(
          "applications",
          backend.id,
          mergeDokployProjectEnv(backend.env, emailEntries),
        );
        await deployDokployService("applications", backend.id);
        configured += 1;
      }
    }
    revalidatePath("/");
    return {
      status: "success",
      message: `Resend DNS and SMTP settings synchronized for ${configured} Vendure backend${configured === 1 ? "" : "s"}. Domain verification may take a few minutes.`,
    };
  } catch (error) {
    return getActionError(
      error,
      "Unable to configure Resend email.",
      "Resend configuration",
    );
  }
}
