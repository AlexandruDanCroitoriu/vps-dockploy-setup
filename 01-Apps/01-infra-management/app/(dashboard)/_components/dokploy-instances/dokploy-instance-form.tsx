"use client";

import {
  CheckIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionMessage, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  createDokployInstanceAction,
  updateDokployInstanceAction,
} from "../../_actions/dokploy-instances";
import type { ActionState } from "../../projects/_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

export function DokployInstanceForm({
  instance,
}: {
  instance: {
    id: string;
    name: string;
    rootUrl: string;
    rootDomain: string;
    apiKey: string;
    defaultServiceUsername: string;
    defaultServicePassword: string;
  } | null;
}) {
  const isEditing = Boolean(instance);
  const [rootDomain, setRootDomain] = useState(instance?.rootDomain ?? "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const dockployUrl = rootDomain.trim()
    ? `https://dockploy.${rootDomain.trim().toLowerCase().replace(/\.$/, "")}`
    : "";
  const action = instance
    ? updateDokployInstanceAction.bind(null, instance.id)
    : createDokployInstanceAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status !== "success") return;
    if (!isEditing) {
      formRef.current?.reset();
    }
    router.replace("/");
    router.refresh();
  }, [isEditing, router, state.status]);

  return (
    <form
      ref={formRef}
      action={formAction}
      autoComplete="off"
      className="mt-5 space-y-4"
    >
      <ActionMessage status={state.status} message={state.message} />
      <FormField label="Name" htmlFor="dockploy-name">
        <Input
          id="dockploy-name"
          name="name"
          required
          maxLength={100}
          autoComplete="off"
          placeholder="Production"
          defaultValue={instance?.name}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Root domain" htmlFor="dockploy-root-domain">
          <Input
            id="dockploy-root-domain"
            name="rootDomain"
            required
            maxLength={253}
            autoComplete="off"
            placeholder="example.com"
            value={rootDomain}
            onChange={(event) => setRootDomain(event.target.value)}
          />
        </FormField>
        <FormField label="Dockploy URL" htmlFor="dockploy-root-url">
          <Input
            id="dockploy-root-url"
            name="rootUrl"
            type="url"
            value={dockployUrl}
            readOnly
            tabIndex={-1}
            aria-describedby="dockploy-root-url-help"
            className="cursor-default bg-gray-50 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400"
          />
          <p
            id="dockploy-root-url-help"
            className="mt-1 text-xs text-gray-500 dark:text-gray-400"
          >
            Generated automatically from the root domain.
          </p>
        </FormField>
      </div>
      <FormField label="API/CLI key" htmlFor="dockploy-api-key">
        <div className="relative">
          <Input
            ref={apiKeyRef}
            id="dockploy-api-key"
            name="apiKey"
            type="text"
            required
            maxLength={4096}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={instance?.apiKey}
            className={`pr-20 ${showApiKey ? "" : "[-webkit-text-security:disc]"}`}
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              onClick={async () => {
                const value = apiKeyRef.current?.value ?? "";
                if (!value) return;
                try {
                  await navigator.clipboard.writeText(value);
                  setApiKeyCopied(true);
                  window.setTimeout(() => setApiKeyCopied(false), 1500);
                } catch {
                  setApiKeyCopied(false);
                }
              }}
              aria-label={
                apiKeyCopied ? "API/CLI key copied" : "Copy API/CLI key"
              }
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
            >
              {apiKeyCopied ? (
                <CheckIcon
                  className="size-5 text-emerald-600"
                  aria-hidden="true"
                />
              ) : (
                <ClipboardDocumentIcon className="size-5" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowApiKey((visible) => !visible)}
              aria-label={showApiKey ? "Hide API/CLI key" : "Show API/CLI key"}
              aria-pressed={showApiKey}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200"
            >
              {showApiKey ? (
                <EyeSlashIcon className="size-5" aria-hidden="true" />
              ) : (
                <EyeIcon className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </FormField>
      <fieldset className="rounded-md border border-gray-200 p-4 dark:border-white/10">
        <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Default service credentials
        </legend>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Used to prefill login credentials when adding services such as DBGate.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Default username"
            htmlFor="default-service-username"
          >
            <Input
              id="default-service-username"
              name="defaultServiceUsername"
              required
              maxLength={255}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={instance?.defaultServiceUsername ?? "admin"}
            />
          </FormField>
          <FormField
            label="Default password"
            htmlFor="default-service-password"
          >
            <Input
              id="default-service-password"
              name="defaultServicePassword"
              type="text"
              required
              maxLength={255}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={instance?.defaultServicePassword ?? "admin"}
            />
          </FormField>
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" size="md" disabled={pending}>
          {pending
            ? "Verifying…"
            : instance
              ? "Verify and save changes"
              : "Verify and add Dockploy"}
        </Button>
      </div>
    </form>
  );
}
