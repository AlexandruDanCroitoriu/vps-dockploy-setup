import "server-only";

import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  getManagedRepositoryPath,
  usesManagedRepositoryCheckout,
} from "./repository-workspace";

export type RepositoryProject = {
  name: string;
  path: string;
  imageRepository: string;
  hasDockerfile: boolean;
  nestedDockerfiles: string[];
  imageTargets: RepositoryImageTarget[];
};

export type RepositoryImageTarget = {
  id: string;
  name: string;
  contextPath: string;
  dockerfilePath: string;
  imageRepository: string;
  available: boolean;
};

async function findNestedDockerfiles(projectDirectory: string) {
  const appsDirectory = path.join(projectDirectory, "apps");
  const entries = await readdir(appsDirectory, { withFileTypes: true }).catch(
    () => [],
  );
  const dockerfiles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const files: string[] = await readdir(
          path.join(appsDirectory, entry.name),
        ).catch(() => []);
        return files.includes("Dockerfile")
          ? `apps/${entry.name}/Dockerfile`
          : null;
      }),
  );
  return dockerfiles.filter((file): file is string => file !== null).sort();
}

export function getRepositoryAppsDirectory() {
  return usesManagedRepositoryCheckout()
    ? path.join(getManagedRepositoryPath(), "01-Apps")
    : path.resolve(process.cwd(), "..");
}

export function getProjectImageRepository(projectName: string) {
  return projectName
    .replace(/^\d+-/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function targetRepository(projectName: string, targetName: string) {
  return `${getProjectImageRepository(projectName)}-${getProjectImageRepository(targetName)}`;
}

function getImageTargets(
  projectName: string,
  hasDockerfile: boolean,
  nestedDockerfiles: string[],
): RepositoryImageTarget[] {
  if (hasDockerfile) {
    return [
      {
        id: "default",
        name: projectName,
        contextPath: ".",
        dockerfilePath: "Dockerfile",
        imageRepository: getProjectImageRepository(projectName),
        available: true,
      },
    ];
  }
  const nestedTargets = nestedDockerfiles.map((dockerfilePath) => {
    const contextPath = path.posix.dirname(dockerfilePath);
    const name = path.posix.basename(contextPath);
    return {
      id: name,
      name,
      contextPath,
      dockerfilePath: path.posix.basename(dockerfilePath),
      imageRepository: targetRepository(projectName, name),
      available: true,
    };
  });
  if (
    projectName.toLowerCase() === "02-online-store-vendure" &&
    nestedTargets.some((target) => target.id === "server")
  ) {
    const server = nestedTargets.find((target) => target.id === "server")!;
    return [
      { ...server, id: "server", name: "Vendure backend" },
      ...nestedTargets
        .filter((target) => target.id !== "server")
        .map((target) => ({ ...target, name: target.id }))
        .sort((left, right) =>
          left.id === "storefront"
            ? -1
            : right.id === "storefront"
              ? 1
              : left.id.localeCompare(right.id),
        ),
    ];
  }
  return nestedTargets.length > 0
    ? nestedTargets
    : [
        {
          id: "default",
          name: projectName,
          contextPath: ".",
          dockerfilePath: "Dockerfile",
          imageRepository: getProjectImageRepository(projectName),
          available: false,
        },
      ];
}

export async function getRepositoryProjects(
  appsDirectory = getRepositoryAppsDirectory(),
): Promise<RepositoryProject[]> {
  const entries = await readdir(appsDirectory, { withFileTypes: true });

  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const projectDirectory = path.join(appsDirectory, entry.name);
        const files = await readdir(projectDirectory);
        const hasDockerfile = files.includes("Dockerfile");
        const nestedDockerfiles = hasDockerfile
          ? []
          : await findNestedDockerfiles(projectDirectory);

        return {
          name: entry.name,
          path: `01-Apps/${entry.name}`,
          imageRepository: getProjectImageRepository(entry.name),
          hasDockerfile,
          nestedDockerfiles,
          imageTargets: getImageTargets(
            entry.name,
            hasDockerfile,
            nestedDockerfiles,
          ),
        };
      }),
  );
}
