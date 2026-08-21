import "server-only";

export type RepositoryApplication = {
  name: string;
  path: string;
  owner: string;
  repository: string;
  branch: string;
};

type GithubContent = {
  type?: unknown;
  name?: unknown;
  path?: unknown;
};

export function getApplicationRepositoryConfig() {
  return {
    owner:
      process.env.GITHUB_REPOSITORY_OWNER || "AlexandruDanCroitoriu",
    repository:
      process.env.GITHUB_REPOSITORY_NAME || "vps-dockploy-setup",
    branch: process.env.GITHUB_REPOSITORY_BRANCH || "main",
    appsPath: process.env.GITHUB_APPS_PATH || "01-Apps",
  };
}

export async function getRepositoryApplications(): Promise<
  RepositoryApplication[]
> {
  const { owner, repository, branch, appsPath } =
    getApplicationRepositoryConfig();
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${appsPath
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/")}`,
  );
  url.searchParams.set("ref", branch);
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GitHub repository lookup failed (${response.status}).`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("GitHub returned an unexpected directory response.");
  }
  return payload
    .flatMap((candidate): RepositoryApplication[] => {
      if (typeof candidate !== "object" || candidate === null) return [];
      const content = candidate as GithubContent;
      if (
        content.type !== "dir" ||
        typeof content.name !== "string" ||
        typeof content.path !== "string"
      ) {
        return [];
      }
      return [
        {
          name: content.name,
          path: content.path,
          owner,
          repository,
          branch,
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
