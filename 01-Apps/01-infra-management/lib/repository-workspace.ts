import "server-only";

import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_REPOSITORY_URL =
  "https://github.com/AlexandruDanCroitoriu/vps-dockploy-setup.git";
const DEFAULT_REPOSITORY_BRANCH = "main";
const DEFAULT_REPOSITORY_PATH = "/app/data/repository";

let checkoutPromise: Promise<string> | null = null;

export function areProjectBuildsEnabled() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.PROJECT_BUILDS_ENABLED === "true"
  );
}

export function usesManagedRepositoryCheckout() {
  return process.env.NODE_ENV === "production";
}

export function getManagedRepositoryPath() {
  return path.resolve(
    process.env.PROJECT_REPOSITORY_PATH || DEFAULT_REPOSITORY_PATH,
  );
}

async function exists(target: string) {
  return stat(target)
    .then(() => true)
    .catch(() => false);
}

async function cloneRepository() {
  const repositoryPath = getManagedRepositoryPath();
  await mkdir(path.dirname(repositoryPath), { recursive: true });
  await execFileAsync("git", [
    "clone",
    "--branch",
    process.env.PROJECT_REPOSITORY_BRANCH || DEFAULT_REPOSITORY_BRANCH,
    "--single-branch",
    process.env.PROJECT_REPOSITORY_URL || DEFAULT_REPOSITORY_URL,
    repositoryPath,
  ]);
  return repositoryPath;
}

async function updateRepository(repositoryPath: string) {
  await execFileAsync(
    "git",
    [
      "pull",
      "--ff-only",
      "origin",
      process.env.PROJECT_REPOSITORY_BRANCH || DEFAULT_REPOSITORY_BRANCH,
    ],
    { cwd: repositoryPath },
  );
  return repositoryPath;
}

export async function ensureRepositoryCheckout() {
  if (!areProjectBuildsEnabled()) {
    throw new Error("Project builds are disabled.");
  }
  if (!usesManagedRepositoryCheckout()) return process.cwd();

  checkoutPromise ??= (async () => {
    const repositoryPath = getManagedRepositoryPath();
    return (await exists(path.join(repositoryPath, ".git")))
      ? updateRepository(repositoryPath)
      : cloneRepository();
  })().catch((error) => {
    checkoutPromise = null;
    throw error;
  });
  return checkoutPromise;
}

export async function refreshRepositoryCheckout() {
  const repositoryPath = await ensureRepositoryCheckout();
  if (!usesManagedRepositoryCheckout()) return repositoryPath;
  return updateRepository(repositoryPath);
}
