"use client";

import { ArrowLeftIcon, CircleStackIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { type FormEvent, useRef, useState } from "react";
import {
  notifyProjectServiceCreation,
  submitProjectServiceCreation,
} from "@/lib/project-events";

import type { DokployDatabaseType } from "@/lib/dokploy";
import { AppDialog } from "@/components/ui/dialog";
import { DeployAfterCreateOption } from "@/components/ui/deploy-after-create-option";
import { useClickOutside } from "@/components/ui/use-click-outside";
import { FormField, inputClassName } from "@/components/ui/form-field";

import type { ActionState } from "../../_actions/shared";

const initialState: ActionState = { status: "idle", message: "" };

const databaseOptions: Array<{
  value: DokployDatabaseType;
  label: string;
  logo: string;
  color: string;
  defaultName: string;
}> = [
  {
    value: "postgres",
    label: "PostgreSQL",
    logo: "https://cdn.simpleicons.org/postgresql/4169E1",
    color: "bg-blue-500/10",
    defaultName: "postgres",
  },
  {
    value: "mysql",
    label: "MySQL",
    logo: "https://cdn.simpleicons.org/mysql/4479A1",
    color: "bg-sky-500/10",
    defaultName: "mysql",
  },
  {
    value: "mariadb",
    label: "MariaDB",
    logo: "https://cdn.simpleicons.org/mariadb/003545",
    color: "bg-cyan-500/10",
    defaultName: "mariadb",
  },
  {
    value: "mongo",
    label: "MongoDB",
    logo: "https://cdn.simpleicons.org/mongodb/47A248",
    color: "bg-emerald-500/10",
    defaultName: "mongo",
  },
  {
    value: "redis",
    label: "Redis",
    logo: "https://cdn.simpleicons.org/redis/DC382D",
    color: "bg-red-500/10",
    defaultName: "redis",
  },
];

function generatePassword() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%_-";
  const values = new Uint32Array(24);
  crypto.getRandomValues(values);
  return Array.from(
    values,
    (value) => characters[value % characters.length],
  ).join("");
}

export function AddDatabaseDialog({
  projectId,
  environments,
  r2Buckets = [],
}: {
  projectId: string;
  environments: Array<{ environmentId: string; name: string }>;
  r2Buckets?: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const listRef = useClickOutside<HTMLDivElement>(isListOpen, setIsListOpen);
  const [type, setType] = useState<DokployDatabaseType | null>(null);
  const [name, setName] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [databaseUser, setDatabaseUser] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState(initialState);
  const latestRequestIdRef = useRef("");
  const router = useRouter();
  const needsDatabaseName =
    type !== null && ["postgres", "mysql", "mariadb"].includes(type);
  const needsUser = type !== null && type !== "redis";
  const selectedOption = databaseOptions.find(
    (option) => option.value === type,
  );

  async function submitDatabase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) return;
    const requestId = crypto.randomUUID();
    latestRequestIdRef.current = requestId;
    const formData = new FormData(event.currentTarget);
    notifyProjectServiceCreation({
      phase: "started",
      service: {
        requestId,
        projectId,
        matchName: name,
        displayName: selectedOption?.label ?? name,
        typeLabel: selectedOption?.label ?? "Database",
        serviceType: type,
      },
    });
    setIsOpen(false);
    const result = await submitProjectServiceCreation(
      projectId,
      "database",
      formData,
    );
    if (latestRequestIdRef.current === requestId) {
      setState({ status: result.status, message: result.message });
    }
    if (result.status === "error") {
      if (result.createdService?.id) {
        notifyProjectServiceCreation({
          phase: "completed",
          projectId,
          requestId,
          serviceId: result.createdService.id,
        });
        router.refresh();
      } else {
        notifyProjectServiceCreation({ phase: "failed", projectId, requestId });
      }
      if (latestRequestIdRef.current === requestId) setIsOpen(true);
      return;
    }
    if (result.createdService?.id) {
      notifyProjectServiceCreation({
        phase: "completed",
        projectId,
        requestId,
        serviceId: result.createdService.id,
      });
    }
    router.refresh();
  }

  function openDialog() {
    setIsListOpen((open) => !open);
  }

  function selectDatabase(option: (typeof databaseOptions)[number]) {
    setType(option.value);
    setName(option.defaultName);
    setDatabaseName(option.defaultName);
    setDatabaseUser(option.defaultName);
    setPassword(generatePassword());
    setIsListOpen(false);
    setIsOpen(true);
  }

  function returnToDatabaseList() {
    setIsOpen(false);
    setType(null);
    setIsListOpen(true);
  }

  return (
    <>
      <div ref={listRef} className="relative">
        <button
          type="button"
          onClick={openDialog}
          disabled={environments.length === 0}
          title={
            environments.length === 0
              ? "Create a project environment before adding a database"
              : "Add database"
          }
          aria-expanded={isListOpen}
          className="inline-flex items-center rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="sr-only">Add database</span>
          <CircleStackIcon className="size-4" aria-hidden="true" />
        </button>

        {isListOpen && (
          <div className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900">
            <p className="border-b border-gray-200 px-3 py-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:border-white/10 dark:text-gray-400">
              Database services
            </p>
            <ul className="py-1">
              {databaseOptions.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => selectDatabase(option)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                  >
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-md ${option.color}`}
                    >
                      <Image
                        src={option.logo}
                        alt=""
                        width={20}
                        height={20}
                        unoptimized
                        className="size-5 object-contain"
                      />
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {option.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {isOpen && type && (
        <AppDialog
          open
          onClose={() => setIsOpen(false)}
          title={`Configure ${selectedOption?.label}`}
          description="Review the defaults and create the database."
          headerActions={
            <button
              type="button"
              onClick={returnToDatabaseList}
              className="rounded p-1 text-gray-400"
            >
              <span className="sr-only">Choose another database</span>
              <ArrowLeftIcon className="size-4" />
            </button>
          }
        >
          <form onSubmit={submitDatabase}>
            <>
              <input type="hidden" name="type" value={type} />
              <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
                {state.status === "error" && (
                  <p className="text-sm text-red-600 sm:col-span-2 dark:text-red-400">
                    {state.message}
                  </p>
                )}
                {environments.length === 1 ? (
                  <input
                    type="hidden"
                    name="environmentId"
                    value={environments[0].environmentId}
                  />
                ) : (
                  <FormField label="Environment">
                    <select name="environmentId" className={inputClassName}>
                      {environments.map((environment) => (
                        <option
                          key={environment.environmentId}
                          value={environment.environmentId}
                        >
                          {environment.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
                <FormField label="Service name">
                  <input
                    name="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={255}
                    className={inputClassName}
                  />
                </FormField>
                {needsDatabaseName && (
                  <FormField label="Database name">
                    <input
                      name="databaseName"
                      value={databaseName}
                      onChange={(event) => setDatabaseName(event.target.value)}
                      required
                      maxLength={255}
                      className={inputClassName}
                    />
                  </FormField>
                )}
                {needsUser && (
                  <FormField label="Database user">
                    <input
                      name="databaseUser"
                      value={databaseUser}
                      onChange={(event) => setDatabaseUser(event.target.value)}
                      required
                      maxLength={255}
                      className={inputClassName}
                    />
                  </FormField>
                )}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setPassword(generatePassword())}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
                    >
                      Generate another
                    </button>
                  </div>
                  <input
                    name="databasePassword"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    maxLength={255}
                    className={inputClassName}
                  />
                </div>
                <DeployAfterCreateOption
                  defaultChecked
                  description="Start the database's first deployment immediately."
                  className="sm:col-span-2"
                />
                {type === "postgres" && (
                  <>
                    <FormField label="R2 backup bucket">
                      <select
                        name="backupBucket"
                        required
                        defaultValue=""
                        className={inputClassName}
                      >
                        <option value="" disabled>
                          Select a bucket
                        </option>
                        {r2Buckets.map((bucket) => (
                          <option key={bucket} value={bucket}>
                            {bucket}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="R2 backup folder">
                      <input
                        name="backupPrefix"
                        required
                        maxLength={200}
                        pattern="[a-zA-Z0-9/_-]+"
                        defaultValue={`${projectId}/postgres`}
                        className={inputClassName}
                      />
                    </FormField>
                    <FormField label="Daily backup time">
                      <input
                        name="backupTime"
                        type="time"
                        required
                        defaultValue="02:00"
                        className={inputClassName}
                      />
                    </FormField>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-white/10">
                <button
                  type="button"
                  onClick={returnToDatabaseList}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create database
                </button>
              </div>
            </>
          </form>
        </AppDialog>
      )}
    </>
  );
}
