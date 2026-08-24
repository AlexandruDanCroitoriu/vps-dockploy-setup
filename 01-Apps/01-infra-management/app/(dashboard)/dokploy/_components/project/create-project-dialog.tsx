"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { notifyProjectsChanged } from "@/lib/project-events";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ActionMessage,
  FormField,
  inputClassName,
} from "@/components/ui/form-field";

import { createProjectAction } from "../../_actions/projects";
import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = {
  status: "idle",
  message: "",
};

export function CreateProjectDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    initialState,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success") return;

    queueMicrotask(() => {
      setIsOpen(false);
      router.refresh();
      notifyProjectsChanged();
    });
  }, [router, state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
      >
        <PlusIcon className="size-4" aria-hidden="true" />
        New project
      </button>

      {isOpen && (
        <AppDialog
          open
          onClose={() => setIsOpen(false)}
          title="Create project"
          description="Add a new project to Dokploy."
          width="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setIsOpen(false)}
                variant="secondary"
                size="xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-project-form"
                disabled={pending}
                size="xs"
              >
                {pending ? "Creating…" : "Create project"}
              </Button>
            </div>
          }
        >
          <form
            id="create-project-form"
            action={formAction}
            className="space-y-4 px-5 py-4"
          >
            <ActionMessage status={state.status} message={state.message} />
            <FormField label="Name" htmlFor="project-name">
              <Input
                id="project-name"
                name="name"
                required
                maxLength={255}
                autoFocus
              />
            </FormField>
            <FormField
              label="Description"
              htmlFor="project-description"
              optional
            >
              <textarea
                id="project-description"
                name="description"
                maxLength={1000}
                rows={3}
                className={`${inputClassName} resize-none`}
              />
            </FormField>
          </form>
        </AppDialog>
      )}
    </>
  );
}
