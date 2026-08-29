"use client";

import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ActionMessage } from "@/components/ui/form-field";
import { configureResendDomainAction, type ResendSetupState } from "./actions";

const initialState: ResendSetupState = { status: "idle", message: "" };

export function ConfigureResendDomainButton({
  instanceId,
  configured,
}: {
  instanceId: string;
  configured: boolean;
}) {
  const router = useRouter();
  const action = configureResendDomainAction.bind(null, instanceId);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <form action={formAction}>
        <Button
          type="submit"
          variant={configured ? "secondary" : "primary"}
          disabled={pending}
          className="inline-flex items-center gap-2"
        >
          {pending && <ArrowPathIcon className="size-4 animate-spin" />}
          {pending ? "Configuring…" : configured ? "Reconfigure" : "Configure"}
        </Button>
      </form>
      <ActionMessage status={state.status} message={state.message} />
    </div>
  );
}
