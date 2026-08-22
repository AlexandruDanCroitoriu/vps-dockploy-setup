"use client";

import dynamic from "next/dynamic";
import { useActionState, useState } from "react";

import { updateRawComposeFileAction } from "../../_actions/services";
import type { ActionState } from "../../_actions/shared";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-80 items-center justify-center text-sm text-gray-500">
      Loading editor…
    </div>
  ),
});

const initialState: ActionState = { status: "idle", message: "" };

export function ComposeFileEditor({
  composeId,
  initialValue,
}: {
  composeId: string;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [state, formAction, pending] = useActionState(
    updateRawComposeFileAction.bind(null, composeId),
    initialState,
  );

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-800/40">
      <form action={formAction}>
        <input type="hidden" name="composeFile" value={value} />
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Compose file
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Changes replace the complete raw Compose document.
            </p>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="overflow-hidden rounded-md border border-gray-300 dark:border-white/10">
            <MonacoEditor
              height="min(55vh, 30rem)"
              language="yaml"
              path={`dokploy-compose-${composeId}.yml`}
              value={value}
              onChange={(nextValue) => setValue(nextValue ?? "")}
              theme="vs-dark"
              options={{
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                fontWeight: "400",
                lineNumbersMinChars: 3,
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: "on",
              }}
            />
          </div>
        </div>
      </form>
    </section>
  );
}
