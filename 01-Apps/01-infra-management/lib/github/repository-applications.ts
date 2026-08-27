import type { DokployProject } from "@/lib/dokploy/types";

export type RepositoryApplication = {
  name: string;
  path: string;
  owner: string;
  repository: string;
  branch: string;
};

export type RepositoryApplicationDeployment = {
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
  const applicationName = application.name.toLowerCase();
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

const applicationFolders = ["01-infra-management"] as const;

export async function getRepositoryApplications(): Promise<
  RepositoryApplication[]
> {
  const { owner, repository, branch, appsPath } =
    getApplicationRepositoryConfig();
  return applicationFolders.map((name) => ({
    name,
    path: `${appsPath}/${name}`,
    owner,
    repository,
    branch,
  }));
}

export async function getRepositoryApplicationsResult(): Promise<RepositoryApplicationsResult> {
  return { applications: await getRepositoryApplications(), error: "" };
}
