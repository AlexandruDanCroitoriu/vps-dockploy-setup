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
};

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

        return {
          name: entry.name,
          path: `01-Apps/${entry.name}`,
          imageRepository: getProjectImageRepository(entry.name),
          hasDockerfile: files.includes("Dockerfile"),
        };
      }),
  );
}
