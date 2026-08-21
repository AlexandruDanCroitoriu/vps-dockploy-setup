"use client";

import { PencilSquareIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import { useActionState, useEffect, useState } from "react";

import type { DokployServiceType } from "@/lib/dokploy";
import { AppDialog } from "@/components/ui/dialog";

import { updateProjectEnvAction } from "../../_actions/projects";
import { updateServiceEnvAction } from "../../_actions/services";
import type { ActionState } from "../../_actions/shared";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center text-sm text-gray-500">
      Loading editor…
    </div>
  ),
});

const initialState: ActionState = {
  status: "idle",
  message: "",
};

type EnvironmentEditorProps =
  | {
      target: "project";
      targetId: string;
      targetName: string;
      initialValue: string;
      inline?: boolean;
    }
  | {
      target: "service";
      targetId: string;
      targetName: string;
      serviceType: DokployServiceType;
      initialValue: string;
      inline?: boolean;
    };

export function EnvironmentVariableEditor(props: EnvironmentEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(props.initialValue);
  const action =
    props.target === "project"
      ? updateProjectEnvAction.bind(null, props.targetId)
      : updateServiceEnvAction.bind(null, props.serviceType, props.targetId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const targetLabel = props.target === "project" ? "Project" : "Service";

  useEffect(() => {
    if (state.status === "success") {
      queueMicrotask(() => setIsOpen(false));
    }
  }, [state]);

  const editor = (
    <div className="overflow-hidden rounded-md border border-gray-300 dark:border-white/10">
      <MonacoEditor
        height={props.inline ? "min(55vh, 30rem)" : "min(60vh, 36rem)"}
        language="ini"
        path={`dokploy-${props.target}-${props.targetId}.env`}
        value={value}
        onChange={(nextValue) => setValue(nextValue ?? "")}
        theme="vs-dark"
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: "on",
        }}
      />
    </div>
  );

  if (props.inline) {
    return (
      <section className="mt-4 max-w-3xl overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
        <form action={formAction}>
          <input type="hidden" name="env" value={value} />
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Environment variables
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Changes replace the complete environment document.
              </p>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
          <div className="p-3">
            {state.message && (
              <p
                role="status"
                className={`mb-2 text-xs ${
                  state.status === "error"
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {state.message}
              </p>
            )}
            {editor}
          </div>
        </form>
      </section>
    );
  }

  return (
    <>
      {props.target === "project" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:text-gray-300 dark:hover:border-indigo-400/40 dark:hover:text-indigo-300"
        >
          Edit variables
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title={`Edit variables for ${props.targetName}`}
          className="ml-auto shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-white/5 dark:hover:text-indigo-300"
        >
          <span className="sr-only">Edit variables for {props.targetName}</span>
          <PencilSquareIcon className="size-4" aria-hidden="true" />
        </button>
      )}

      {isOpen && (
        <AppDialog
          open
          onClose={() => setIsOpen(false)}
          title={`${targetLabel} variables · ${props.targetName}`}
          description={`Edit the environment document for this ${props.target}.`}
          width="lg"
        >
          <form action={formAction}>
            <input type="hidden" name="env" value={value} />

            <div className="p-4 sm:p-6">
              {state.status === "error" && (
                <p className="mb-3 text-sm text-red-600 dark:text-red-400">
                  {state.message}
                </p>
              )}
              {editor}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-white/10">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Saving replaces all environment variables for this{" "}
                {props.target}.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save variables"}
                </button>
              </div>
            </div>
          </form>
        </AppDialog>
      )}
    </>
  );
}
