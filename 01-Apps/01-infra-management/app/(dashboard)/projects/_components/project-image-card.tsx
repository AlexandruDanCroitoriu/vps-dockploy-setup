"use client";

import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
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

import { Button } from "@/components/ui/button";
import { ActionMessage } from "@/components/ui/form-field";
import type { LocalDockerImage } from "@/lib/docker/local-image-builder";
import type { ImageJob } from "@/lib/docker/image-jobs";
import type { RepositoryProject } from "@/lib/repository-projects";
import type { ZotRegistryImage } from "@/lib/zot/registry-images";

import {
  buildAndPushProjectImageAction,
  buildProjectImageAction,
  type BuildImageState,
  deleteLocalProjectImageAction,
  deleteZotProjectImageAction,
  pushProjectImageToAllRegistriesAction,
} from "../_actions/build-image";
import { RefreshZotButton } from "./refresh-zot-button";

const initialState: BuildImageState = { status: "idle", message: "" };

type ProjectRegistry = {
  instanceId: string;
  instanceName: string;
  host: string;
  images: ZotRegistryImage[];
  error: string;
};

export function ProjectImageCard({
  project,
  registries,
  localImages,
  localImagesError,
  dockerAvailable,
  initialJob,
}: {
  project: RepositoryProject;
  registries: ProjectRegistry[];
  localImages: LocalDockerImage[];
  localImagesError: string;
  dockerAvailable: boolean;
  initialJob: ImageJob | null;
}) {
  const [buildState, buildAction, buildPending] = useActionState(
    buildProjectImageAction,
    initialState,
  );
  const [pushState, pushAction, pushPending] = useActionState(
    pushProjectImageToAllRegistriesAction,
    initialState,
  );
  const [buildPushState, buildPushAction, buildPushPending] = useActionState(
    buildAndPushProjectImageAction,
    initialState,
  );
  const [localDeleteState, localDeleteAction, localDeletePending] =
    useActionState(deleteLocalProjectImageAction, initialState);
  const [zotDeleteState, zotDeleteAction, zotDeletePending] = useActionState(
    deleteZotProjectImageAction,
    initialState,
  );
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
      (candidate) => candidate.projectName === project.name,
    );
    if (nextJob) setJob(nextJob);
  }, [project.name]);

  const currentJob = [job, buildState.job, pushState.job, buildPushState.job]
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
    buildPushState.status !== "idle"
      ? buildPushState
      : pushState.status !== "idle"
        ? pushState
        : buildState;
  const state = currentJob ?? actionState;
  const jobRunning = currentJob?.status === "running";
  const building = jobRunning && currentJob.type === "build";
  const pushing = jobRunning && currentJob.type === "push";
  const buildingAndPushing = jobRunning && currentJob.type === "build-push";
  const imageActionPending =
    buildPending || pushPending || buildPushPending || jobRunning;
  const availableRegistries = registries.filter((registry) => registry.host);

  useEffect(() => {
    if (
      buildState.status === "success" ||
      pushState.status === "success" ||
      buildPushState.status === "success" ||
      localDeleteState.status === "success" ||
      zotDeleteState.status === "success"
    ) {
      router.refresh();
    }
  }, [
    buildState.status,
    pushState.status,
    buildPushState.status,
    localDeleteState.status,
    zotDeleteState.status,
    router,
  ]);
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-800/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            <CubeIcon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {project.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {project.path}
            </p>
          </div>
        </div>
        <form className="flex shrink-0 flex-wrap justify-end gap-2">
          <input type="hidden" name="projectName" value={project.name} />
          <input type="hidden" name="tag" value="latest" />
          <Button
            type="submit"
            formAction={buildAction}
            disabled={
              imageActionPending || !project.hasDockerfile || !dockerAvailable
            }
            title={dockerAvailable ? "Build image" : "Docker is not available"}
            className="inline-flex items-center gap-1.5"
          >
            {building || buildPending ? (
              <ArrowPathIcon
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <CubeIcon className="size-4" aria-hidden="true" />
            )}
            {building || buildPending ? "Building…" : "Build"}
          </Button>
          <Button
            type="submit"
            formAction={buildPushAction}
            disabled={
              imageActionPending ||
              !project.hasDockerfile ||
              !dockerAvailable ||
              availableRegistries.length === 0
            }
            title={
              availableRegistries.length > 0
                ? "Build the image and push it to every Zot registry"
                : "Deploy Zot on a configured instance before building and pushing"
            }
            variant="success"
            className="inline-flex items-center gap-1.5"
          >
            {buildingAndPushing || buildPushPending ? (
              <ArrowPathIcon
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
            )}
            {buildingAndPushing || buildPushPending
              ? "Building & pushing…"
              : "Build & push"}
          </Button>
        </form>
      </div>

      {state.status !== "success" && (
        <ActionMessage status={state.status} message={state.message} />
      )}

      <div className="mt-5 space-y-5 border-t border-gray-200 pt-5 dark:border-white/10">
        <LocalImageList
          title="Local Docker images"
          projectName={project.name}
          emptyMessage="No local builds yet."
          error={localImagesError}
          deleteAction={localDeleteAction}
          deletePending={localDeletePending}
          deleteState={localDeleteState}
          items={localImages.map((image) => ({
            key: `${image.name}:${image.tag}`,
            name: `${image.name}:${image.tag}`,
            tag: image.tag,
            identifier: image.imageId,
            date: image.createdAt,
            label: image.current ? "Current" : "Previous",
          }))}
        />
        <ZotRegistryTable
          project={project}
          registries={registries}
          localImagesAvailable={localImages.length > 0}
          imageActionPending={imageActionPending}
          pushing={pushing || pushPending}
          pushAction={pushAction}
          deleteAction={zotDeleteAction}
          deletePending={zotDeletePending}
          deleteState={zotDeleteState}
        />
      </div>

      {!project.hasDockerfile && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          Add a Dockerfile to this project before building an image.
        </p>
      )}
    </article>
  );
}

function ZotRegistryTable({
  project,
  registries,
  localImagesAvailable,
  imageActionPending,
  pushing,
  pushAction,
  deleteAction,
  deletePending,
  deleteState,
}: {
  project: RepositoryProject;
  registries: ProjectRegistry[];
  localImagesAvailable: boolean;
  imageActionPending: boolean;
  pushing: boolean;
  pushAction: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
  deletePending: boolean;
  deleteState: BuildImageState;
}) {
  return (
    <section>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Zot repositories
        </h3>
        <div className="flex items-center gap-1">
          <RefreshZotButton />
          <form action={pushAction}>
            <input type="hidden" name="projectName" value={project.name} />
            <input type="hidden" name="tag" value="latest" />
            <Button
              type="submit"
              size="xs"
              variant="success"
              disabled={
                imageActionPending ||
                !project.hasDockerfile ||
                !localImagesAvailable ||
                !registries.some((registry) => registry.host)
              }
              title="Push the image to every available Zot registry"
              className="inline-flex items-center gap-1"
            >
              {pushing ? (
                <ArrowPathIcon
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ArrowUpTrayIcon className="size-3.5" aria-hidden="true" />
              )}
              {pushing ? "Pushing…" : "Push to all"}
            </Button>
          </form>
        </div>
      </div>
      {deleteState.status === "error" && (
        <ActionMessage
          status={deleteState.status}
          message={deleteState.message}
        />
      )}
      <div className="mt-2 overflow-x-auto rounded-md border border-gray-200 dark:border-white/10">
        <table className="min-w-full divide-y divide-gray-200 text-left text-xs dark:divide-white/10">
          <thead className="bg-gray-50 text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Dokploy instance
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Repository versions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {registries.map((registry) => (
              <tr key={registry.instanceId} className="align-top">
                <th
                  scope="row"
                  className="min-w-40 px-3 py-3 font-medium text-gray-900 dark:text-gray-100"
                >
                  <span className="block">{registry.instanceName}</span>
                  {registry.host && (
                    <a
                      href={`https://${registry.host}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 font-normal text-indigo-600 hover:underline dark:text-indigo-300"
                    >
                      {registry.host}
                      <ArrowTopRightOnSquareIcon
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                    </a>
                  )}
                </th>
                <td className="min-w-72 px-3 py-3">
                  {registry.error ? (
                    <p className="text-red-600 dark:text-red-400">
                      {registry.error}
                    </p>
                  ) : !registry.host ? (
                    <p className="text-gray-500 dark:text-gray-400">
                      Zot registry is not deployed in this instance.
                    </p>
                  ) : registry.images.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">
                      No published versions yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-white/5">
                      {registry.images.map((image) => (
                        <li
                          key={`${image.digest}:${image.tag}`}
                          className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0 flex-1">
                            <a
                              href={`https://${registry.host}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-full items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                              title={`Open ${image.name}:${image.tag} in Zot`}
                            >
                              <span className="truncate">
                                {image.name}:{image.tag}
                              </span>
                              <ArrowTopRightOnSquareIcon
                                className="size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                            </a>
                            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                              {formatImageDate(image.publishedAt)}
                            </p>
                          </div>
                          {image.current && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                              Current
                            </span>
                          )}
                          <form
                            action={deleteAction}
                            onSubmit={(event) => {
                              if (
                                image.current &&
                                !window.confirm(
                                  `Delete the current image ${image.name}:${image.tag}? This image may be in use.`,
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input
                              type="hidden"
                              name="projectName"
                              value={project.name}
                            />
                            <input
                              type="hidden"
                              name="instanceId"
                              value={registry.instanceId}
                            />
                            <input type="hidden" name="tag" value={image.tag} />
                            <input
                              type="hidden"
                              name="digest"
                              value={image.digest}
                            />
                            <button
                              type="submit"
                              disabled={deletePending}
                              aria-label={`Delete ${image.name}:${image.tag}`}
                              title={`Delete ${image.name}:${image.tag}`}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-400/10 dark:hover:text-red-300"
                            >
                              <TrashIcon
                                className="size-4"
                                aria-hidden="true"
                              />
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
            {registries.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="px-3 py-4 text-center text-gray-500 dark:text-gray-400"
                >
                  No Dokploy instances are configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LocalImageList({
  title,
  projectName,
  items,
  emptyMessage,
  error,
  deleteAction,
  deletePending,
  deleteState,
}: {
  title: string;
  projectName: string;
  items: Array<{
    key: string;
    name: string;
    tag: string;
    identifier: string;
    date: string;
    label?: string;
  }>;
  emptyMessage: string;
  error: string;
  deleteAction: (formData: FormData) => void;
  deletePending: boolean;
  deleteState: BuildImageState;
}) {
  return (
    <section>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      </div>
      {deleteState.status === "error" && (
        <ActionMessage
          status={deleteState.status}
          message={deleteState.message}
        />
      )}
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-white/5 dark:border-white/10">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                  {item.name}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {formatImageDate(item.date)}
                </p>
              </div>
              {item.label && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    item.label === "Current"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                      : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"
                  }`}
                >
                  {item.label}
                </span>
              )}
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
          ))}
        </ul>
      )}
    </section>
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
