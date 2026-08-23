"use client";

import { TrashIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { ActionMessage } from "@/components/ui/form-field";
import { deleteDokployInstanceAction } from "../../_actions/dokploy-instances";
import type { ActionState } from "../../projects/_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

export function DeleteDokployInstanceButton({
  instanceId,
  instanceName,
}: {
  instanceId: string;
  instanceName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteDokployInstanceAction.bind(null, instanceId),
    initialState,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success") return;
    router.replace("/?addDockploy=1");
    router.refresh();
  }, [router, state.status]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${instanceName}`}
        className="absolute top-4 right-4 rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
      >
        <TrashIcon className="size-5" aria-hidden="true" />
      </button>

      {open && (
        <AppDialog
          open
          onClose={() => setOpen(false)}
          title="Delete Dockploy instance"
          description={`Remove ${instanceName} from Infra Management.`}
          width="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="delete-dokploy-instance-form"
                variant="danger"
                size="xs"
                disabled={pending}
              >
                {pending ? "Deleting…" : "Delete instance"}
              </Button>
            </div>
          }
        >
          <form
            id="delete-dokploy-instance-form"
            action={formAction}
            className="space-y-3 px-5 py-4"
          >
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This removes the stored URL, root domain, and API/CLI key. It does
              not delete anything from the Dockploy server.
            </p>
            <ActionMessage status={state.status} message={state.message} />
          </form>
        </AppDialog>
      )}
    </>
  );
}
