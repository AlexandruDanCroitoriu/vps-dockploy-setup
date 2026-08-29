import type { DokployProject } from "@/lib/dokploy/types";

export type RepositoryApplication = {
  name: string;
  path: string;
  owner: string;
  repository: string;
  branch: string;
  kind?: "vendure-backend" | "vendure-storefront";
  parentPath?: string;
  repeatable?: boolean;
  deploymentName?: string;
};

export type RepositoryApplicationDeployment = {
  id?: string;
  name: string;
  sourcePath: string | null;
};

export type RepositoryApplicationsResult = {
  applications: RepositoryApplication[];
  error: string;
};

function normalizePath(value: string) {
  const normalized = value.trim();
  return normalized ? `/${normalized.replace(/^\/+|\/+$/g, "")}` : "/";
}

function findRepositoryApplicationDeployment<
  T extends { name: string; sourcePath: string | null },
>(application: RepositoryApplication, deployedApplications: readonly T[]) {
  const applicationPath = normalizePath(application.path).toLowerCase();
  const applicationName = (
    application.deploymentName ?? application.name
  ).toLowerCase();
  return deployedApplications.find(
    (deployed) =>
      deployed.name.toLowerCase() === applicationName ||
      (deployed.sourcePath !== null &&
        normalizePath(deployed.sourcePath).toLowerCase() === applicationPath),
  );
}

export function isRepositoryApplicationDeployed(
  application: RepositoryApplication,
  deployedApplications: ReadonlyArray<{
    name: string;
    sourcePath: string | null;
  }>,
) {
  if (application.repeatable) return false;
  return Boolean(
    findRepositoryApplicationDeployment(application, deployedApplications),
  );
}

export function matchesRepositoryApplicationInput(
  application: RepositoryApplication,
  input: { owner: string; repository: string; buildPath: string },
) {
  return (
    application.owner === input.owner &&
    application.repository === input.repository &&
    normalizePath(application.path).toLowerCase() ===
      normalizePath(input.buildPath).toLowerCase()
  );
}

export function getRepositoryApplicationDeployments(
  projects: readonly DokployProject[],
): RepositoryApplicationDeployment[] {
  return projects.flatMap((project) =>
    project.environments.flatMap((environment) =>
      environment.services.flatMap((service) =>
        service.type === "applications"
          ? [
              {
                id: service.id,
                name: service.name,
                sourcePath: service.sourcePath,
              },
            ]
          : [],
      ),
    ),
  );
}

export function getApplicationRepositoryConfig() {
  return {
    owner: "AlexandruDanCroitoriu",
    repository: "vps-dockploy-setup",
    branch: "main",
    appsPath: "01-Apps",
  };
}

const applicationDefinitions: Array<
  Pick<
    RepositoryApplication,
    "name" | "path" | "kind" | "parentPath" | "repeatable" | "deploymentName"
  >
> = [
  { name: "01-infra-management", path: "01-Apps/01-infra-management" },
  {
    name: "vendure-backend",
    path: "01-Apps/02-Online-Store-Vendure/apps/server",
    kind: "vendure-backend",
    deploymentName: "vendure",
  },
  {
    name: "vendure-storefront",
    path: "01-Apps/02-Online-Store-Vendure/apps/storefront",
    kind: "vendure-storefront",
    parentPath: "01-Apps/02-Online-Store-Vendure/apps/server",
    repeatable: true,
  },
  {
    name: "vendure-storefront-clean",
    path: "01-Apps/02-Online-Store-Vendure/apps/storefront-clean",
    kind: "vendure-storefront",
    parentPath: "01-Apps/02-Online-Store-Vendure/apps/server",
    repeatable: true,
  },
];

export async function getRepositoryApplications(): Promise<
  RepositoryApplication[]
> {
  const { owner, repository, branch } = getApplicationRepositoryConfig();
  return applicationDefinitions.map((definition) => ({
    ...definition,
    owner,
    repository,
    branch,
  }));
}

export async function getRepositoryApplicationsResult(): Promise<RepositoryApplicationsResult> {
  return { applications: await getRepositoryApplications(), error: "" };
}
