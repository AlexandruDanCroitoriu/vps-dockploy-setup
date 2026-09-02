"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { updateProjectNameAction } from "../../_actions/projects";
import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = {
  status: "idle",
  message: "",
};

export function ProjectNameEditor({
  projectId,
  initialName,
}: {
  projectId: string;
  initialName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancellingRef = useRef(false);
  const action = updateProjectNameAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (state.status !== "success") return;

    queueMicrotask(() => {
      setEditing(false);
      router.refresh();
    });
  }, [router, state]);

  if (!editing) {
    return (
      <button
        type="button"
        onDoubleClick={() => setEditing(true)}
        title="Double-click to rename project"
        className="cursor-text text-left hover:text-indigo-600 dark:hover:text-indigo-300"
      >
        {name}
      </button>
    );
  }

  return (
    <form action={formAction} className="relative">
      <input
        ref={inputRef}
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={(event) => {
          if (cancellingRef.current) {
            cancellingRef.current = false;
            return;
          }

          if (event.currentTarget.value.trim() && !pending) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancellingRef.current = true;
            setName(initialName);
            setEditing(false);
          }
        }}
        required
        maxLength={255}
        disabled={pending}
        aria-label="Project name"
        className="w-full min-w-40 rounded-md border border-indigo-400 bg-white px-2 py-1 text-base font-semibold text-gray-900 ring-2 ring-indigo-500/20 outline-none dark:bg-gray-900 dark:text-white"
      />
      {state.status === "error" && (
        <p className="absolute top-full left-0 z-10 mt-1 rounded bg-red-600 px-2 py-1 text-xs font-normal whitespace-nowrap text-white shadow-lg">
          {state.message}
        </p>
      )}
    </form>
  );
}
