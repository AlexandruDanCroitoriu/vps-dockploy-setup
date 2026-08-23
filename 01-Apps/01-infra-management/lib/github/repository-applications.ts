export type RepositoryApplication = {
  name: string;
  path: string;
  owner: string;
  repository: string;
  branch: string;
};

export type RepositoryApplicationsResult = {
  applications: RepositoryApplication[];
  error: string;
};

export function getApplicationRepositoryConfig() {
  return {
    owner: "AlexandruDanCroitoriu",
    repository: "vps-dockploy-setup",
    branch: "main",
    appsPath: "01-Apps",
  };
}

const applicationFolders = ["01-infra-management"] as const;

export function getRepositoryApplicationDefaultHost(
  application: RepositoryApplication,
  rootDomain: string,
) {
  return application.name.toLowerCase() === "01-infra-management"
    ? rootDomain
    : "";
}

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
