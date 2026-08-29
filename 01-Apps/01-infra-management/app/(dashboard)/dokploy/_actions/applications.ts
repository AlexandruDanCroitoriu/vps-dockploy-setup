"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import {
  createDokployDockerApplication,
  createDokployGithubApplication,
  deployDokployService,
  DOKPLOY_APPLICATION_BUILD_TYPES,
  generateDokployDomain,
  getActiveDokployConfiguration,
  getDokployDomains,
  getFreshDokployService,
  getFreshDokployProject,
  getFreshDokployProjects,
  isValidHostname,
  isValidPort,
  mergeDokployProjectEnv,
  parseDokployEnvironmentEntries,
  updateDokployProjectEnv,
  updateDokployServiceEnv,
  type DokployApplicationBuildType,
} from "@/lib/dokploy";
import {
  resolveInfraManagementHostname,
  serializeInfraManagementEnvironment,
} from "@/lib/dokploy/infra-management-environment";
import {
  getRepositoryApplications,
  getRepositoryApplicationDeployments,
  isRepositoryApplicationDeployed,
  matchesRepositoryApplicationInput,
} from "@/lib/github/repository-applications";
import { getInfraManagementZotImage } from "@/lib/zot/infra-management-image";
import { getVendureBackendZotImage } from "@/lib/zot/vendure-backend-image";
import {
  getVendureStorefrontZotImage,
  isVendureStorefrontPath,
} from "@/lib/zot/vendure-storefront-image";
import { getVendureChannels } from "@/lib/vendure/channels";
import {
  getVendurePostgresEnvironment,
  getVendureEmailEnvironment,
  getVendureStorageEnvironment,
  VendureBackendSetupError,
} from "@/lib/vendure/backend-environment";
import { provisionResendDomain } from "@/lib/resend/provisioning";
import {
  deployAfterCreateRequested,
  getActionError,
  requireAuthenticatedSession,
  SESSION_EXPIRED_STATE,
  startInitialDeployment,
  type ActionState,
} from "./shared";

const APP_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const BRANCH_PATTERN = /^[a-zA-Z0-9._\-/#]+$/;
const REPOSITORY_PART_PATTERN = /^[a-zA-Z0-9._-]+$/;
const INFRA_MANAGEMENT_PATH = "/01-Apps/01-infra-management";
const VENDURE_BACKEND_PATH = "/01-Apps/02-Online-Store-Vendure/apps/server";
const VENDURE_STOREFRONT_PATHS = new Set([
  "/01-Apps/02-Online-Store-Vendure/apps/storefront",
  "/01-Apps/02-Online-Store-Vendure/apps/storefront-clean",
]);

function deployedStorefrontUrl(
  rootDomain: string,
  services: readonly {
    name: string;
    sourcePath: string | null;
    status: string;
  }[],
  folder: "storefront" | "storefront-clean" = "storefront",
) {
  const storefronts = services.filter(
    (service) =>
      service.sourcePath?.endsWith(`/apps/${folder}`) ||
      service.name.toLowerCase() === `vendure-${folder}`,
  );
  const storefront =
    storefronts.find((service) => service.status === "running") ??
    storefronts[0];
  const deployedFolder = storefront?.sourcePath?.split("/").at(-1) ?? folder;
  return `https://${deployedFolder}.${rootDomain}`;
}

function isInfraManagementApplication(input: {
  owner: string;
  repository: string;
  buildPath: string;
}) {
  return (
    input.owner === "AlexandruDanCroitoriu" &&
    input.repository === "vps-dockploy-setup" &&
    input.buildPath === INFRA_MANAGEMENT_PATH
  );
}

function field(formData: FormData, name: string) {
  return formData.get(name)?.toString().trim() ?? "";
}

function environmentLine(name: string, value: string) {
  return `${name}=${JSON.stringify(value)}`;
}

async function resolveVendureBackend(projectId: string, applicationId: string) {
  const project = await getFreshDokployProject(projectId);
  const backend = project?.environments
    .flatMap((environment) => environment.services)
    .find(
      (service) =>
        service.type === "applications" &&
        service.id === applicationId &&
        (service.name.toLowerCase() === "vendure" ||
          service.sourcePath?.toLowerCase() ===
            VENDURE_BACKEND_PATH.toLowerCase()),
    );
  if (!backend) throw new Error("The selected Vendure backend was not found.");
  const domains = await getDokployDomains("applications", applicationId);
  const domain = domains.find((candidate) => candidate.enabled) ?? domains[0];
  if (!domain) {
    throw new Error(
      "Add a domain to the Vendure backend before creating a storefront.",
    );
  }
  return `${domain.https ? "https" : "http"}://${domain.host}`;
}

export async function getVendureChannelsAction(
  projectId: string,
  applicationId: string,
) {
  if (!(await requireAuthenticatedSession())) {
    return { status: "error" as const, message: SESSION_EXPIRED_STATE.message };
  }
  try {
    const [origin, instance] = await Promise.all([
      resolveVendureBackend(projectId, applicationId),
      getActiveDokployConfiguration(),
    ]);
    if (!instance) throw new Error("No active Dockploy instance is selected.");
    return {
      status: "success" as const,
      channels: await getVendureChannels({
        adminApiUrl: `${origin}/admin-api`,
        username: instance.defaultServiceUsername,
        password: instance.defaultServicePassword,
      }),
    };
  } catch (error) {
    const state = getActionError(
      error,
      "Unable to load Vendure channels.",
      "Vendure channel discovery",
    );
    return { status: "error" as const, message: state.message };
  }
}

async function getInfraManagementEnvironment(input: {
  owner: string;
  repository: string;
  buildPath: string;
  host: string;
}) {
  if (!isInfraManagementApplication(input)) {
    return undefined;
  }

  const instance = await getActiveDokployConfiguration();
  if (!instance) throw new Error("No active Dokploy instance is selected.");

  const hostname = input.host || instance.rootDomain;
  if (!isValidHostname(hostname)) {
    throw new Error(
      "Configure a valid instance root domain before deploying Infra Management.",
    );
  }

  const authSecret = randomBytes(32).toString("base64url");

  return serializeInfraManagementEnvironment({
    username: instance.defaultServiceUsername,
    password: instance.defaultServicePassword,
    authSecret,
    nextAuthUrl: `https://${hostname}`,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN ?? "",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
  });
}

export async function generateApplicationDomainAction(applicationName: string) {
  if (!(await requireAuthenticatedSession())) {
    return { status: "error" as const, message: SESSION_EXPIRED_STATE.message };
  }

  const name = applicationName.trim();
  if (!APP_NAME_PATTERN.test(name) || name.length > 63) {
    return {
      status: "error" as const,
      message: "Enter a valid application name.",
    };
  }

  try {
    return {
      status: "success" as const,
      domain: await generateDokployDomain(name),
    };
  } catch (error) {
    const state = getActionError(
      error,
      "Unable to generate a domain.",
      "domain generation",
    );
    return { status: "error" as const, message: state.message };
  }
}

export async function createApplicationAction(
  projectId: string,
  previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previousState;
  if (!(await requireAuthenticatedSession())) return SESSION_EXPIRED_STATE;

  let name = field(formData, "name");
  const description = field(formData, "description");
  const environmentId = field(formData, "environmentId");
  const githubId = field(formData, "githubId");
  const owner = field(formData, "owner");
  const repository = field(formData, "repository");
  const branch = field(formData, "branch");
  const buildPath = field(formData, "buildPath");
  const buildType = field(formData, "buildType") as DokployApplicationBuildType;
  const dockerfile = field(formData, "dockerfile");
  const dockerContextPath = field(formData, "dockerContextPath");
  const publishDirectory = field(formData, "publishDirectory");
  let host = field(formData, "host").toLowerCase();
  const subdomain = field(formData, "subdomain");
  let port = Number(formData.get("port"));
  const watchPaths = field(formData, "watchPaths")
    .split(/[\r\n,]+/)
    .map((path) => path.trim())
    .filter(Boolean);
  const deployAfterCreate = deployAfterCreateRequested(formData);
  const vendureBackendId = field(formData, "vendureBackendId");
  const vendureChannelToken = field(formData, "vendureChannelToken");
  const vendureTemplateProvisioning =
    field(formData, "vendureTemplateProvisioning") === "on";
  const vendurePreset =
    buildPath === VENDURE_BACKEND_PATH ||
    VENDURE_STOREFRONT_PATHS.has(buildPath);
  const vendureBackend = buildPath === VENDURE_BACKEND_PATH;
  const vendureStorefront = isVendureStorefrontPath(buildPath);

  if (vendureBackend) {
    const instance = await getActiveDokployConfiguration();
    if (!instance || !isValidHostname(instance.rootDomain)) {
      return {
        status: "error",
        message:
          "Configure a valid instance root domain before deploying Vendure.",
      };
    }
    name = "vendure";
    host ||= `vendure.${instance.rootDomain}`;
    port = 3000;
  }

  if (vendureStorefront) {
    const instance = await getActiveDokployConfiguration();
    if (!instance || !isValidHostname(instance.rootDomain)) {
      return {
        status: "error",
        message:
          "Configure a valid instance root domain before deploying a Vendure storefront.",
      };
    }
    const storefrontFolder = buildPath.split("/").at(-1) ?? "storefront";
    name = `vendure-${storefrontFolder}`;
    host ||= `${storefrontFolder}.${instance.rootDomain}`;
    port = 3000;
  }

  if (
    !projectId ||
    !name ||
    !environmentId ||
    !owner ||
    !repository ||
    !branch ||
    !buildPath ||
    !DOKPLOY_APPLICATION_BUILD_TYPES.includes(buildType)
  ) {
    return { status: "error", message: "Complete all required fields." };
  }
  const infraManagement = isInfraManagementApplication({
    owner,
    repository,
    buildPath,
  });
  if (infraManagement) {
    const instance = await getActiveDokployConfiguration();
    if (!instance || !isValidHostname(instance.rootDomain)) {
      return {
        status: "error",
        message:
          "Configure a valid instance root domain before deploying Infra Management.",
      };
    }
    host = resolveInfraManagementHostname(subdomain, instance.rootDomain);
  }
  if (host && (!isValidHostname(host) || !isValidPort(port))) {
    return { status: "error", message: "Enter a valid hostname and port." };
  }
  if (vendurePreset && !host) {
    return {
      status: "error",
      message: "A domain hostname is required for Vendure deployments.",
    };
  }
  if (!APP_NAME_PATTERN.test(name) || name.length > 63) {
    return {
      status: "error",
      message:
        "Name must be 1–63 letters, numbers, dots, dashes, or underscores.",
    };
  }
  if (
    !REPOSITORY_PART_PATTERN.test(owner) ||
    !REPOSITORY_PART_PATTERN.test(repository) ||
    !BRANCH_PATTERN.test(branch)
  ) {
    return { status: "error", message: "Invalid repository or branch." };
  }
  if (
    description.length > 1_000 ||
    buildPath.length > 1_000 ||
    dockerfile.length > 1_000 ||
    dockerContextPath.length > 1_000 ||
    publishDirectory.length > 1_000 ||
    watchPaths.length > 50 ||
    watchPaths.some((path) => path.length > 1_000)
  ) {
    return { status: "error", message: "Application details are too long." };
  }

  try {
    const repositoryApplication = (await getRepositoryApplications()).find(
      (application) =>
        matchesRepositoryApplicationInput(application, {
          owner,
          repository,
          buildPath,
        }),
    );
    if (repositoryApplication) {
      const projects = await getFreshDokployProjects();
      const deployedApplications =
        getRepositoryApplicationDeployments(projects);
      if (
        isRepositoryApplicationDeployed(
          repositoryApplication,
          deployedApplications,
        )
      ) {
        return {
          status: "error",
          message:
            "This repository application is already deployed on the active Dockploy instance.",
        };
      }
    }

    let environmentVariables = await getInfraManagementEnvironment({
      owner,
      repository,
      buildPath,
      host,
    });
    if (vendureBackend) {
      const [instance, project] = await Promise.all([
        getActiveDokployConfiguration(),
        getFreshDokployProject(projectId),
      ]);
      if (!instance)
        throw new Error("No active Dockploy instance is selected.");
      if (!project)
        throw new VendureBackendSetupError(
          "The selected project was not found.",
        );
      const environment = project.environments.find(
        (candidate) => candidate.environmentId === environmentId,
      );
      if (!environment)
        throw new VendureBackendSetupError(
          "The selected project environment was not found.",
        );
      const currentProjectEnvironment = parseDokployEnvironmentEntries(
        project.env,
      );
      const { sendingKey } = await provisionResendDomain(
        instance.rootDomain,
        currentProjectEnvironment.SMTP_PASSWORD,
      );
      const projectEnvironment = mergeDokployProjectEnv(project.env, {
        SMTP_HOST: "smtp.resend.com",
        SMTP_PORT: "465",
        SMTP_SECURE: "true",
        SMTP_USERNAME: "resend",
        SMTP_PASSWORD: sendingKey,
        MAIL_FROM_ADDRESS: `account@${instance.rootDomain}`,
        MAIL_FROM_NAME: instance.name,
        VENDURE_STOREFRONT_URL: deployedStorefrontUrl(
          instance.rootDomain,
          environment.services,
        ),
        VENDURE_STOREFRONT_CLEAN_URL: deployedStorefrontUrl(
          instance.rootDomain,
          environment.services,
          "storefront-clean",
        ),
      });
      if (projectEnvironment !== project.env) {
        await updateDokployProjectEnv(projectId, projectEnvironment);
      }
      const databaseEnvironment = getVendurePostgresEnvironment(
        projectEnvironment,
        environment.services,
      );
      const storageEnvironment =
        getVendureStorageEnvironment(projectEnvironment);
      const emailEnvironment = getVendureEmailEnvironment(projectEnvironment);
      environmentVariables = [
        environmentLine("APP_ENV", "production"),
        environmentLine("COOKIE_SECRET", randomBytes(32).toString("base64url")),
        environmentLine("SUPERADMIN_USERNAME", instance.defaultServiceUsername),
        environmentLine("SUPERADMIN_PASSWORD", instance.defaultServicePassword),
        environmentLine("VENDURE_HOST", host),
        ...(vendureChannelToken
          ? [environmentLine("VENDURE_CHANNEL_TOKEN", vendureChannelToken)]
          : []),
        ...Object.entries(databaseEnvironment).map(([key, value]) =>
          environmentLine(key, value),
        ),
        ...Object.entries(storageEnvironment).map(([key, value]) =>
          environmentLine(key, value),
        ),
        ...Object.entries(emailEnvironment).map(([key, value]) =>
          environmentLine(key, value),
        ),
      ].join("\n");
    } else if (vendureStorefront) {
      if (!vendureBackendId || !vendureChannelToken) {
        return {
          status: "error",
          message: "Select a Vendure backend and channel.",
        };
      }
      const origin = await resolveVendureBackend(projectId, vendureBackendId);
      const instance = await getActiveDokployConfiguration();
      if (!instance)
        throw new Error("No active Dockploy instance is selected.");
      if (!vendureTemplateProvisioning) {
        const channels = await getVendureChannels({
          adminApiUrl: `${origin}/admin-api`,
          username: instance.defaultServiceUsername,
          password: instance.defaultServicePassword,
        });
        if (
          !channels.some((channel) => channel.token === vendureChannelToken)
        ) {
          return {
            status: "error",
            message: "The selected Vendure channel is no longer available.",
          };
        }
      }
      const storefrontOrigin = `${formData.get("https") === "on" ? "https" : "http"}://${host}`;
      const storefrontUrlEnvironmentKey = buildPath.endsWith(
        "/storefront-clean",
      )
        ? "VENDURE_STOREFRONT_CLEAN_URL"
        : "VENDURE_STOREFRONT_URL";
      const storefrontProject = await getFreshDokployProject(projectId);
      const backendSummary = storefrontProject?.environments
        .flatMap((environment) => environment.services)
        .find(
          (service) =>
            service.type === "applications" && service.id === vendureBackendId,
        );
      if (!storefrontProject || !backendSummary) {
        throw new Error("The selected Vendure backend is no longer available.");
      }
      const backend = await getFreshDokployService(
        projectId,
        "applications",
        backendSummary.id,
      );
      if (!backend?.env.trim()) {
        throw new VendureBackendSetupError(
          "Unable to load the Vendure backend environment without risking its existing configuration.",
        );
      }
      const updatedProjectEnvironment = mergeDokployProjectEnv(
        storefrontProject.env,
        { [storefrontUrlEnvironmentKey]: storefrontOrigin },
      );
      if (updatedProjectEnvironment !== storefrontProject.env) {
        await updateDokployProjectEnv(projectId, updatedProjectEnvironment);
      }
      await updateDokployServiceEnv(
        "applications",
        backend.id,
        mergeDokployProjectEnv(backend.env, {
          [storefrontUrlEnvironmentKey]: storefrontOrigin,
        }),
      );
      await deployDokployService("applications", backend.id);
      environmentVariables = [
        environmentLine("VENDURE_SHOP_API_URL", `${origin}/shop-api`),
        environmentLine("VENDURE_CHANNEL_TOKEN", vendureChannelToken),
        environmentLine("NEXT_PUBLIC_SITE_URL", storefrontOrigin),
        environmentLine(
          "REVALIDATION_SECRET",
          randomBytes(32).toString("base64url"),
        ),
      ].join("\n");
    }
    const domain = host
      ? {
          host,
          port,
          https: formData.get("https") === "on",
        }
      : undefined;
    const applicationId =
      infraManagement || vendureBackend || vendureStorefront
        ? await (async () => {
            const zotImage = vendureBackend
              ? await getVendureBackendZotImage()
              : vendureStorefront
                ? await getVendureStorefrontZotImage(buildPath)
                : await getInfraManagementZotImage();
            if (!zotImage.available) {
              if (vendureBackend || vendureStorefront) {
                throw new VendureBackendSetupError(zotImage.message);
              }
              throw new Error(zotImage.message);
            }
            return createDokployDockerApplication({
              name,
              description,
              environmentId,
              image: zotImage.image,
              registryUrl: zotImage.registry.host,
              registryUsername: zotImage.registry.username,
              registryPassword: zotImage.registry.password,
              environmentVariables,
              mounts: infraManagement
                ? [
                    {
                      type: "volume",
                      volumeName: "infra-management-data",
                      mountPath: "/app/data",
                    },
                    {
                      type: "bind",
                      hostPath: "/var/run/docker.sock",
                      mountPath: "/var/run/docker.sock",
                    },
                  ]
                : undefined,
              domain,
            });
          })()
        : await createDokployGithubApplication({
            name,
            description,
            environmentId,
            githubId: githubId || undefined,
            owner,
            repository,
            branch,
            buildPath,
            watchPaths,
            buildType,
            dockerfile,
            dockerContextPath,
            publishDirectory,
            isStaticSpa: formData.get("isStaticSpa") === "on",
            autoDeploy: formData.get("autoDeploy") === "on",
            environmentVariables,
            domain,
          });
    if (deployAfterCreate) {
      if (!(await startInitialDeployment("applications", applicationId))) {
        revalidatePath("/dokploy");
        revalidatePath(`/dokploy/${projectId}`);
        return {
          status: "error",
          message:
            "The application was created, but its first deployment could not be started.",
          createdService: { id: applicationId, type: "applications" },
        };
      }
    }
    revalidatePath("/dokploy");
    revalidatePath(`/dokploy/${projectId}`);
    return {
      status: "success",
      message: deployAfterCreate
        ? "Application created and deployment started."
        : "Application created.",
      createdService: { id: applicationId, type: "applications" },
    };
  } catch (error) {
    if (error instanceof VendureBackendSetupError) {
      return { status: "error", message: error.message };
    }
    return getActionError(
      error,
      "Unable to create the application.",
      "the application setup",
    );
  }
}
