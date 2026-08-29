"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ActionMessage } from "@/components/ui/form-field";
import { configureResendAction } from "../_actions/resend";
import type { ActionState } from "../dokploy/_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

export function ResendConfiguration({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(
    configureResendAction,
    initialState,
  );
  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-gray-800/40">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Transactional email
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {configured
          ? "The Resend management key is available. Configure the active instance to verify its domain and synchronize restricted SMTP credentials to its Vendure projects."
          : "Set the server-only RESEND_API_KEY environment variable to enable automated Vendure email delivery."}
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={!configured || pending}>
          {pending ? "Configuring…" : "Configure Vendure email"}
        </Button>
        <ActionMessage status={state.status} message={state.message} />
      </form>
    </section>
  );
}
