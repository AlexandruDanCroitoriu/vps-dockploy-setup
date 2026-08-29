import "server-only";

import { execFile, spawn } from "node:child_process";
import { access, chmod, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import Database from "better-sqlite3";

const execFileAsync = promisify(execFile);
const DOCKER_OUTPUT_LIMIT = 16_000;
const INFRA_MANAGEMENT_DIRECTORY = "01-infra-management";
const INFRA_MANAGEMENT_SEED = ".infra-management-seed.sqlite";

export async function createInfraManagementDatabaseSeed(
  projectDirectory: string,
) {
  const seedPath = path.join(projectDirectory, INFRA_MANAGEMENT_SEED);
  const sourcePath = path.resolve(
    process.env.SQLITE_DATABASE_PATH ||
      (process.env.NODE_ENV === "production"
        ? "/app/data/infra-management.sqlite"
        : path.join(projectDirectory, "data", "infra-management.sqlite")),
  );
  await unlink(seedPath).catch(() => undefined);
  if (
    !(await access(sourcePath)
      .then(() => true)
      .catch(() => false))
  ) {
    return null;
  }

  const source = new Database(sourcePath, { readonly: true });
  try {
    await source.backup(seedPath);
    await chmod(seedPath, 0o600);
    return seedPath;
  } finally {
    source.close();
  }
}

export type DockerCommandResult = {
  image: string;
  output: string;
};

export type LocalDockerImage = {
  name: string;
  tag: string;
  imageId: string;
  createdAt: string;
  current: boolean;
  digests: string[];
};

export function isValidDockerTag(value: string) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(value);
}

export function isDockerDaemonUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return [
    /cannot connect to the docker daemon/i,
    /is the docker daemon running/i,
    /error during connect/i,
    /failed to connect.+docker\.sock/i,
    /docker_engine.+(?:file|path).+not found/i,
    /docker\.sock.+(?:no such file|connection refused)/i,
    /docker.+could not be found/i,
    /activate the wsl integration in docker desktop/i,
    /spawn docker enoent/i,
  ].some((pattern) => pattern.test(message));
}

function truncateOutput(value: string) {
  if (value.length <= DOCKER_OUTPUT_LIMIT) return value;
  return `…output truncated…\n${value.slice(-DOCKER_OUTPUT_LIMIT)}`;
}

async function runDocker(args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      maxBuffer: 4 * 1024 * 1024,
    });
    return `${stdout}${stderr}`.trim();
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    const output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim();
    throw new Error(truncateOutput(output || failure.message));
  }
}

export async function listLocalDockerImages(
  repository: string,
): Promise<LocalDockerImage[]> {
  const output = await runDocker([
    "image",
    "ls",
    "--no-trunc",
    "--filter",
    `reference=${repository}:*`,
    "--format",
    "{{json .}}",
  ]);
  if (!output) return [];

  const rows = output
    .split("\n")
    .flatMap(
      (
        line,
      ): Array<Omit<LocalDockerImage, "createdAt" | "current" | "digests">> => {
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          const name =
            typeof value.Repository === "string" ? value.Repository : "";
          const tag = typeof value.Tag === "string" ? value.Tag : "";
          const imageId = typeof value.ID === "string" ? value.ID : "";
          return name && tag && tag !== "<none>"
            ? [{ name, tag, imageId }]
            : [];
        } catch {
          return [];
        }
      },
    );
  const imageIds = [...new Set(rows.map((row) => row.imageId))];
  if (imageIds.length === 0) return [];
  const inspectOutput = await runDocker([
    "image",
    "inspect",
    "--format",
    "{{json .}}",
    ...imageIds,
  ]);
  const createdById = new Map<string, string>();
  const digestsById = new Map<string, string[]>();
  for (const line of inspectOutput.split("\n")) {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (typeof value.Id === "string" && typeof value.Created === "string") {
        createdById.set(value.Id, value.Created);
        const repoDigests = Array.isArray(value.RepoDigests)
          ? value.RepoDigests.flatMap((digest) => {
              if (typeof digest !== "string") return [];
              const separator = digest.lastIndexOf("@");
              return separator >= 0 ? [digest.slice(separator + 1)] : [];
            })
          : [];
        digestsById.set(value.Id, [...new Set(repoDigests)]);
      }
    } catch {
      // Ignore malformed Docker output and retain an empty date.
    }
  }

  return collapseLocalDockerImages(
    rows.map((row) => ({
      ...row,
      createdAt: createdById.get(row.imageId) ?? "",
      current: false,
      digests: digestsById.get(row.imageId) ?? [],
    })),
  );
}

export function collapseLocalDockerImages(images: LocalDockerImage[]) {
  const sorted = [...images].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
  const currentImageId =
    sorted.find((image) => image.tag === "latest")?.imageId ??
    sorted[0]?.imageId;
  const groups = new Map<string, LocalDockerImage[]>();
  for (const image of sorted) {
    groups.set(image.imageId, [...(groups.get(image.imageId) ?? []), image]);
  }

  return [...groups.entries()]
    .map(([imageId, tags]) => {
      const current = imageId === currentImageId;
      const selected =
        (current ? tags.find((image) => image.tag === "latest") : undefined) ??
        tags.find((image) => image.tag.startsWith("build-")) ??
        tags[0];
      return { ...selected, current };
    })
    .sort((left, right) => {
      if (left.current !== right.current) return left.current ? -1 : 1;
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
}

export function createBuildVersionTag(date = new Date()) {
  return `build-${date.toISOString().replace(/[-:.]/g, "")}`;
}

export async function tagDockerImageVersion(
  repository: string,
  sourceTag: string,
) {
  const repoTagsOutput = await runDocker([
    "image",
    "inspect",
    "--format",
    "{{json .RepoTags}}",
    `${repository}:${sourceTag}`,
  ]);
  const repoTags = JSON.parse(repoTagsOutput) as unknown;
  const existingVersion = Array.isArray(repoTags)
    ? repoTags.find(
        (tag): tag is string =>
          typeof tag === "string" && tag.startsWith(`${repository}:build-`),
      )
    : undefined;
  if (existingVersion) return existingVersion.slice(repository.length + 1);

  const versionTag = createBuildVersionTag();
  await runDocker([
    "tag",
    `${repository}:${sourceTag}`,
    `${repository}:${versionTag}`,
  ]);
  return versionTag;
}

export async function deleteLocalDockerImage(image: string) {
  const repository = image.slice(0, image.lastIndexOf(":"));
  const output = await runDocker([
    "image",
    "inspect",
    "--format",
    "{{json .RepoTags}}",
    image,
  ]);
  const repoTags = JSON.parse(output) as unknown;
  const matchingTags = Array.isArray(repoTags)
    ? repoTags.filter(
        (tag): tag is string =>
          typeof tag === "string" && tag.startsWith(`${repository}:`),
      )
    : [];
  await runDocker([
    "image",
    "rm",
    ...(matchingTags.length ? matchingTags : [image]),
  ]);
}

function runDockerWithInput(args: string[], input: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const output = `${stdout}${stderr}`.trim();
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(
        new Error(truncateOutput(output || `Docker exited with code ${code}.`)),
      );
    });
    child.stdin.end(input);
  });
}

export async function buildDockerImage({
  projectDirectory,
  image,
}: {
  projectDirectory: string;
  image: string;
}): Promise<DockerCommandResult> {
  const seedPath = path.join(projectDirectory, INFRA_MANAGEMENT_SEED);
  const shouldSeed =
    path.basename(projectDirectory) === INFRA_MANAGEMENT_DIRECTORY;
  try {
    if (shouldSeed) {
      await createInfraManagementDatabaseSeed(projectDirectory);
    }

    const buildOutput = await runDocker([
      "build",
      "--pull",
      "--tag",
      image,
      projectDirectory,
    ]);

    return {
      image,
      output: truncateOutput(
        [`Built ${image}`, buildOutput].filter(Boolean).join("\n\n"),
      ),
    };
  } finally {
    if (shouldSeed) await unlink(seedPath).catch(() => undefined);
  }
}

export async function pushDockerImage({
  localImage,
  registryImage,
  registryHost,
  username,
  password,
}: {
  localImage: string;
  registryImage: string;
  registryHost: string;
  username: string;
  password: string;
}): Promise<DockerCommandResult> {
  const loginOutput = await runDockerWithInput(
    ["login", registryHost, "--username", username, "--password-stdin"],
    `${password}\n`,
  );
  const tagOutput = await runDocker(["tag", localImage, registryImage]);
  const pushOutput = await runDocker(["push", registryImage]);

  return {
    image: registryImage,
    output: truncateOutput(
      [loginOutput, tagOutput, `Pushed ${registryImage}`, pushOutput]
        .filter(Boolean)
        .join("\n\n"),
    ),
  };
}
