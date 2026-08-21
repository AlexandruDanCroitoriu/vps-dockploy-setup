"use client";

import {
  CheckIcon,
  ClipboardDocumentIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

import { AppDialog } from "@/components/ui/dialog";
import type { DokployService } from "@/lib/dokploy";

export function DatabaseCredentials({
  credentials,
  databaseName,
  inline = false,
}: {
  credentials: DokployService["credentials"];
  databaseName: string;
  inline?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  async function copyCredential(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedLabel(label);
    window.setTimeout(() => setCopiedLabel(null), 1500);
  }

  if (credentials.length === 0) return null;

  const credentialsList = (
    <dl className="grid gap-px overflow-hidden rounded-md border border-gray-200 bg-gray-200 sm:grid-cols-2 dark:border-white/10 dark:bg-white/10">
      {credentials.map((credential) => {
        const copied = copiedLabel === credential.label;
        const isConnectionUrl = credential.label === "Internal Connection URL";

        return (
          <div
            key={credential.label}
            className={`min-w-0 bg-white px-3 py-2.5 dark:bg-gray-900 ${
              isConnectionUrl ? "sm:col-span-2" : ""
            }`}
          >
            <dt className="text-[11px] font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
              {credential.label}
            </dt>
            <dd className="mt-0.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 text-xs font-medium break-all text-gray-800 dark:text-gray-200">
                {credential.value}
              </code>
              <button
                type="button"
                onClick={() =>
                  copyCredential(credential.label, credential.value)
                }
                title={`Copy ${credential.label}`}
                className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-white/5 dark:hover:text-indigo-300"
              >
                <span className="sr-only">Copy {credential.label}</span>
                {copied ? (
                  <CheckIcon
                    className="size-4 text-emerald-500"
                    aria-hidden="true"
                  />
                ) : (
                  <ClipboardDocumentIcon
                    className="size-4"
                    aria-hidden="true"
                  />
                )}
              </button>
            </dd>
          </div>
        );
      })}
    </dl>
  );

  if (inline) {
    return (
      <section className="mt-4 max-w-3xl rounded-lg border border-gray-200 bg-white p-3.5 dark:border-white/10 dark:bg-gray-800/40">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Internal Credentials
          </h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium tracking-wide text-gray-500 uppercase dark:bg-white/5 dark:text-gray-400">
            Private network
          </span>
        </div>
        {credentialsList}
      </section>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={`View internal credentials for ${databaseName}`}
        className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 dark:hover:bg-white/5 dark:hover:text-indigo-300"
      >
        <span className="sr-only">
          View internal credentials for {databaseName}
        </span>
        <KeyIcon className="size-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <AppDialog
          open
          onClose={() => setIsOpen(false)}
          title={`Internal Credentials · ${databaseName}`}
          description="Use these credentials from services on the same Dokploy network."
        >
          <div className="p-5 sm:p-6">{credentialsList}</div>
        </AppDialog>
      )}
    </>
  );
}
