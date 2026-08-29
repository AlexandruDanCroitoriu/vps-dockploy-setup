"use client";

import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CubeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { ActionMessage } from "@/components/ui/form-field";
import type { LocalDockerImage } from "@/lib/docker/local-image-builder";
import type { ImageJob } from "@/lib/docker/image-jobs";
import type {
  RepositoryImageTarget,
  RepositoryProject,
} from "@/lib/repository-projects";

import {
  buildProjectImageAction,
  type BuildImageState,
  deleteLocalProjectImageAction,
  pushProjectImageToRegistryAction,
} from "../_actions/build-image";
import {
  registryHasLocalImage,
  type PublishedRegistryImage,
} from "./project-image-publication";

const initialState: BuildImageState = { status: "idle", message: "" };

type ProjectRegistry = {
  instanceId: string;
  instanceName: string;
  host: string;
  images: Array<{
    name: string;
    tag: string;
    digest: string;
    publishedAt: string;
    current: boolean;
    configDigest: string;
  }>;
  publishedImages: PublishedRegistryImage[];
};

export function ProjectImageCard({
  project,
  target,
  registries,
  localImages,
  localImagesError,
  dockerAvailable,
  initialJob,
  embedded = false,
}: {
  project: RepositoryProject;
  target: RepositoryImageTarget;
  registries: ProjectRegistry[];
  localImages: LocalDockerImage[];
  localImagesError: string;
  dockerAvailable: boolean;
  initialJob: ImageJob | null;
  embedded?: boolean;
}) {
  const [buildState, buildAction, buildPending] = useActionState(
    buildProjectImageAction,
    initialState,
  );
  const [localDeleteState, localDeleteAction, localDeletePending] =
    useActionState(deleteLocalProjectImageAction, initialState);
  const [registryPushState, registryPushAction, registryPushPending] =
    useActionState(pushProjectImageToRegistryAction, initialState);
  const [job, setJob] = useState(initialJob);
  const previousJobStatus = useRef(initialJob?.status);
  const router = useRouter();
  const refreshJob = useCallback(async () => {
    const response = await fetch("/api/projects/image-jobs", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { jobs?: ImageJob[] };
    const nextJob = payload.jobs?.find(
      (candidate) => candidate.projectName === `${project.name}:${target.id}`,
    );
    if (nextJob) setJob(nextJob);
  }, [project.name, target.id]);

  const currentJob = [job, buildState.job]
    .filter(
      (candidate): candidate is ImageJob =>
        candidate !== null && candidate !== undefined,
    )
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];

  useEffect(() => {
    if (currentJob?.status !== "running") return;
    const initialTimer = window.setTimeout(() => void refreshJob(), 0);
    const pollTimer = window.setInterval(() => void refreshJob(), 2_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
    };
  }, [currentJob?.startedAt, currentJob?.status, refreshJob]);

  useEffect(() => {
    if (
      previousJobStatus.current === "running" &&
      currentJob?.status !== "running"
    ) {
      router.refresh();
    }
    previousJobStatus.current = currentJob?.status;
  }, [currentJob?.status, router]);

  const actionState =
    registryPushState.status !== "idle" ? registryPushState : buildState;
  const state = currentJob ?? actionState;
  const jobRunning = currentJob?.status === "running";
  const building = jobRunning && currentJob.type === "build";
  const imageActionPending = buildPending || jobRunning;
  const availableRegistries = registries.filter((registry) => registry.host);
  const zotOnlyImages = availableRegistries.flatMap((registry) =>
    registry.images
      .filter(
        (registryImage) =>
          !localImages.some(
            (localImage) =>
              registryImage.configDigest === localImage.imageId ||
              localImage.digests.includes(registryImage.digest),
          ),
      )
      .map((image) => ({
        ...image,
        instanceId: registry.instanceId,
        instanceName: registry.instanceName,
        host: registry.host,
      })),
  );

  useEffect(() => {
    if (
      buildState.status === "success" ||
      registryPushState.status === "success" ||
      localDeleteState.status === "success"
    ) {
      router.refresh();
    }
  }, [
    buildState.status,
    registryPushState.status,
    localDeleteState.status,
    router,
  ]);
  const Container = embedded ? "section" : "article";
  return (
    <Container
      className={
        embedded
          ? "relative py-4 pl-6 before:absolute before:top-7 before:-left-px before:h-px before:w-4 before:bg-gray-200 last:pb-0 dark:before:bg-white/10"
          : "rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-800/50"
      }
    >
      {embedded && (
        <span
          className="absolute top-[1.4rem] -left-1.5 size-3 rounded-full border-2 border-white bg-indigo-500 dark:border-gray-800"
          aria-hidden="true"
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {!embedded && (
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <CubeIcon className="size-5" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                {embedded ? target.imageRepository : target.name}
              </h2>
              <form action={buildAction}>
                <input type="hidden" name="projectName" value={project.name} />
                <input type="hidden" name="targetId" value={target.id} />
                <input type="hidden" name="tag" value="latest" />
                <Button
                  type="submit"
                  size="xs"
                  disabled={
                    imageActionPending || !target.available || !dockerAvailable
                  }
                  title={
                    dockerAvailable ? "Build image" : "Docker is not available"
                  }
                  className="inline-flex items-center gap-1.5"
                >
                  {building || buildPending ? (
                    <ArrowPathIcon
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <CubeIcon className="size-3.5" aria-hidden="true" />
                  )}
                  {building || buildPending ? "Building…" : "Build"}
                </Button>
              </form>
            </div>
            {!embedded && (
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {`${project.name} · ${project.path}/${target.contextPath === "." ? "" : target.contextPath}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {!target.available && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          Add a Dockerfile to this project before building an image.
        </p>
      )}

      {state.status !== "success" && (
        <ActionMessage status={state.status} message={state.message} />
      )}

      <div
        className={
          embedded
            ? "mt-3 w-full border-t border-gray-100 pt-3 dark:border-white/5"
            : "mt-5 space-y-5 border-t border-gray-200 pt-5 dark:border-white/10"
        }
      >
        <LocalImageList
          projectName={project.name}
          targetId={target.id}
          emptyMessage="No local builds yet."
          error={localImagesError}
          deleteAction={localDeleteAction}
          deletePending={localDeletePending}
          deleteState={localDeleteState}
          registries={availableRegistries}
          pushAction={registryPushAction}
          pushPending={registryPushPending}
          pushState={registryPushState}
          zotOnlyItems={zotOnlyImages}
          items={localImages.map((image) => ({
            key: `${image.name}:${image.tag}`,
            name: target.imageRepository,
            tag: image.tag,
            identifier: image.imageId,
            digests: image.digests,
            date: image.createdAt,
            label: image.current ? "Current" : "Previous",
          }))}
        />
      </div>
    </Container>
  );
}

function LocalImageList({
  projectName,
  targetId,
  items,
  emptyMessage,
  error,
  deleteAction,
  deletePending,
  deleteState,
  registries,
  pushAction,
  pushPending,
  pushState,
  zotOnlyItems,
}: {
  projectName: string;
  targetId: string;
  items: Array<{
    key: string;
    name: string;
    tag: string;
    identifier: string;
    digests: string[];
    date: string;
    label?: string;
  }>;
  emptyMessage: string;
  error: string;
  deleteAction: (formData: FormData) => void;
  deletePending: boolean;
  deleteState: BuildImageState;
  registries: ProjectRegistry[];
  pushAction: (formData: FormData) => void;
  pushPending: boolean;
  pushState: BuildImageState;
  zotOnlyItems: Array<{
    name: string;
    tag: string;
    digest: string;
    publishedAt: string;
    current: boolean;
    instanceId: string;
    instanceName: string;
    host: string;
  }>;
}) {
  return (
    <section>
      {deleteState.status === "error" && (
        <ActionMessage
          status={deleteState.status}
          message={deleteState.message}
        />
      )}
      {pushState.status === "error" && (
        <ActionMessage status={pushState.status} message={pushState.message} />
      )}
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : items.length === 0 && zotOnlyItems.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-white/5 dark:border-white/10">
          {items.map((item) => {
            return (
              <li
                key={item.key}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                      {item.name}
                    </p>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
                      Local
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {formatImageDate(item.date)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {registries.map((registry) => {
                    const published = registryHasLocalImage(
                      registry.publishedImages,
                      item,
                    );
                    if (published) {
                      return (
                        <a
                          key={registry.instanceId}
                          href={`https://${registry.host}/image/${encodeURIComponent(item.name)}`}
                          target="_blank"
                          rel="noreferrer"
                          title={`Open ${item.name} in ${registry.instanceName}`}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500"
                        >
                          <ArrowUpTrayIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          {registry.instanceName} ✓
                        </a>
                      );
                    }
                    return (
                      <form key={registry.instanceId} action={pushAction}>
                        <input
                          type="hidden"
                          name="projectName"
                          value={projectName}
                        />
                        <input type="hidden" name="targetId" value={targetId} />
                        <input type="hidden" name="tag" value={item.tag} />
                        <input
                          type="hidden"
                          name="instanceId"
                          value={registry.instanceId}
                        />
                        <RegistryPushButton
                          imageName={item.name}
                          instanceName={registry.instanceName}
                          pushPending={pushPending}
                        />
                      </form>
                    );
                  })}
                </div>
                <form
                  action={deleteAction}
                  onSubmit={(event) => {
                    if (
                      item.label === "Current" &&
                      !window.confirm(
                        `Delete the current image ${item.name}? This image may be in use.`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="projectName" value={projectName} />
                  <input type="hidden" name="targetId" value={targetId} />
                  <input type="hidden" name="tag" value={item.tag} />
                  <input type="hidden" name="digest" value={item.identifier} />
                  <button
                    type="submit"
                    disabled={deletePending}
                    aria-label={`Delete ${item.name}`}
                    title={`Delete ${item.name}`}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-400/10 dark:hover:text-red-300"
                  >
                    <TrashIcon className="size-4" aria-hidden="true" />
                  </button>
                </form>
              </li>
            );
          })}
          {zotOnlyItems.map((item) => (
            <li
              key={`${item.instanceId}:${item.digest}:${item.tag}`}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <a
                    href={`https://${item.host}/image/${encodeURIComponent(item.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                    title={`Open ${item.name}:${item.tag} in ${item.instanceName}`}
                  >
                    {item.name}:{item.tag}
                  </a>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                    In Zot
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {formatImageDate(item.publishedAt)}
                </p>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {item.instanceName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RegistryPushButton({
  imageName,
  instanceName,
  pushPending,
}: {
  imageName: string;
  instanceName: string;
  pushPending: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="xs"
      variant="secondary"
      disabled={pushPending}
      aria-label={
        pending
          ? `Pushing ${imageName} to ${instanceName}`
          : `Push ${imageName} to ${instanceName}`
      }
      title={`Push ${imageName} to ${instanceName}`}
      className="inline-flex items-center gap-1"
    >
      {pending ? (
        <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowUpTrayIcon className="size-3.5" aria-hidden="true" />
      )}
      {pending ? "Pushing…" : instanceName}
    </Button>
  );
}

function formatImageDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
