"use client";

import {
  ArrowUpTrayIcon,
  CubeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ActionMessage, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { LocalDockerImage } from "@/lib/docker/local-image-builder";
import type { RepositoryProject } from "@/lib/repository-projects";
import type { ZotRegistryImage } from "@/lib/zot/registry-images";

import {
  buildProjectImageAction,
  type BuildImageState,
  deleteLocalProjectImageAction,
  deleteZotProjectImageAction,
  pushProjectImageAction,
} from "../_actions/build-image";

const initialState: BuildImageState = { status: "idle", message: "" };

export function ProjectImageCard({
  project,
  zotRegistryHost,
  localImages,
  localImagesError,
  zotImages,
  zotImagesError,
}: {
  project: RepositoryProject;
  zotRegistryHost: string;
  localImages: LocalDockerImage[];
  localImagesError: string;
  zotImages: ZotRegistryImage[];
  zotImagesError: string;
}) {
  const [buildState, buildAction, buildPending] = useActionState(
    buildProjectImageAction,
    initialState,
  );
  const [pushState, pushAction, pushPending] = useActionState(
    pushProjectImageAction,
    initialState,
  );
  const [localDeleteState, localDeleteAction, localDeletePending] =
    useActionState(deleteLocalProjectImageAction, initialState);
  const [zotDeleteState, zotDeleteAction, zotDeletePending] = useActionState(
    deleteZotProjectImageAction,
    initialState,
  );
  const state = pushState.status !== "idle" ? pushState : buildState;
  const router = useRouter();

  useEffect(() => {
    if (
      buildState.status === "success" ||
      pushState.status === "success" ||
      localDeleteState.status === "success" ||
      zotDeleteState.status === "success"
    ) {
      router.refresh();
    }
  }, [
    buildState.status,
    pushState.status,
    localDeleteState.status,
    zotDeleteState.status,
    router,
  ]);
  const localImage = `${project.imageRepository}:<tag>`;
  const zotImage = zotRegistryHost
    ? `${zotRegistryHost}/${project.imageRepository}:<tag>`
    : "No Zot registry available";

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-800/50">
      <div className="flex items-start gap-3">
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

      <form className="mt-5 space-y-4">
        <input type="hidden" name="projectName" value={project.name} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]">
          <FormField label="Local image">
            <Input value={localImage} readOnly aria-label="Local image" />
          </FormField>
          <FormField label="Zot image">
            <Input value={zotImage} readOnly aria-label="Zot image" />
          </FormField>
          <FormField label="Tag" htmlFor={`tag-${project.name}`}>
            <Input
              id={`tag-${project.name}`}
              name="tag"
              defaultValue="latest"
              required
              pattern="[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}"
            />
          </FormField>
        </div>

        <ActionMessage status={state.status} message={state.message} />

        <div className="flex justify-end gap-2">
          <Button
            type="submit"
            formAction={buildAction}
            disabled={buildPending || pushPending || !project.hasDockerfile}
            className="inline-flex items-center gap-1.5"
          >
            <CubeIcon className="size-4" aria-hidden="true" />
            {buildPending ? "Building…" : "Build"}
          </Button>
          <Button
            type="submit"
            formAction={pushAction}
            disabled={
              buildPending ||
              pushPending ||
              !project.hasDockerfile ||
              !zotRegistryHost ||
              localImages.length === 0
            }
            title={
              localImages.length === 0
                ? "Build a local image before pushing"
                : "Push the image to Zot"
            }
            variant="success"
            className="inline-flex items-center gap-1.5"
          >
            <ArrowUpTrayIcon className="size-4" aria-hidden="true" />
            {pushPending ? "Pushing…" : "Push"}
          </Button>
        </div>
      </form>

      <div className="mt-5 grid gap-4 border-t border-gray-200 pt-5 lg:grid-cols-2 dark:border-white/10">
        <ImageList
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
        <ImageList
          title="Zot registry versions"
          projectName={project.name}
          emptyMessage={
            zotRegistryHost
              ? "No published versions yet."
              : "No Zot registry available."
          }
          error={zotImagesError}
          deleteAction={zotDeleteAction}
          deletePending={zotDeletePending}
          deleteState={zotDeleteState}
          items={zotImages.map((image) => ({
            key: `${image.digest}:${image.tag}`,
            name: `${image.name}:${image.tag}`,
            tag: image.tag,
            identifier: image.digest,
            date: image.publishedAt,
            label: image.current ? "Current" : "Previous",
          }))}
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

function ImageList({
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
      <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      <ActionMessage
        status={deleteState.status}
        message={deleteState.message}
      />
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
