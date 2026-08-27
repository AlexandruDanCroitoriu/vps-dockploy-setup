import "server-only";

export type ImageJob = {
  projectName: string;
  type: "build" | "push" | "build-push";
  status: "running" | "success" | "error";
  message: string;
  startedAt: string;
  finishedAt: string | null;
};

type ImageJobResult = { status: "success" | "error"; message: string };

const globalJobs = globalThis as typeof globalThis & {
  __infraImageJobs?: Map<string, ImageJob>;
};

const jobs = globalJobs.__infraImageJobs ?? new Map<string, ImageJob>();

if (process.env.NODE_ENV !== "production") {
  globalJobs.__infraImageJobs = jobs;
}

export function getImageJob(projectName: string) {
  return jobs.get(projectName) ?? null;
}

export function listImageJobs() {
  return [...jobs.values()];
}

export function startImageJob(
  projectName: string,
  type: ImageJob["type"],
  run: () => Promise<ImageJobResult>,
) {
  const current = getImageJob(projectName);
  if (current?.status === "running") return current;

  const job: ImageJob = {
    projectName,
    type,
    status: "running",
    message:
      type === "build"
        ? "Building image…"
        : type === "push"
          ? "Pushing image to Zot…"
          : "Building and pushing image…",
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobs.set(projectName, job);

  void run()
    .then((result) => {
      Object.assign(job, result, { finishedAt: new Date().toISOString() });
    })
    .catch(() => {
      Object.assign(job, {
        status: "error",
        message:
          type === "build"
            ? "Docker build failed."
            : type === "push"
              ? "Docker push failed. Build the image first and verify Zot is reachable."
              : "Docker build or push failed.",
        finishedAt: new Date().toISOString(),
      });
    });

  return job;
}
