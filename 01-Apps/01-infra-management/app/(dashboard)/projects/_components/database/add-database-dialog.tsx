"use client";

import { ArrowLeftIcon, CircleStackIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { notifyProjectsChanged } from "@/lib/project-events";

import type { DokployDatabaseType } from "@/lib/dokploy";
import { AppDialog } from "@/components/ui/dialog";
import { FormField, inputClassName } from "@/components/ui/form-field";

import { createDatabaseAction } from "../../_actions/databases";
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
}: {
  projectId: string;
  environments: Array<{ environmentId: string; name: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<DokployDatabaseType | null>(null);
  const [name, setName] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [databaseUser, setDatabaseUser] = useState("");
  const [password, setPassword] = useState("");
  const action = createDatabaseAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const router = useRouter();
  const needsDatabaseName =
    type !== null && ["postgres", "mysql", "mariadb"].includes(type);
  const needsUser = type !== null && type !== "redis";
  const selectedOption = databaseOptions.find(
    (option) => option.value === type,
  );

  useEffect(() => {
    if (state.status !== "success") return;

    queueMicrotask(() => {
      setIsOpen(false);
      router.refresh();
      notifyProjectsChanged();
    });
  }, [router, state]);

  function openDialog() {
    setType(null);
    setIsOpen(true);
  }

  function selectDatabase(option: (typeof databaseOptions)[number]) {
    setType(option.value);
    setName(option.defaultName);
    setDatabaseName(option.defaultName);
    setDatabaseUser(option.defaultName);
    setPassword(generatePassword());
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={environments.length === 0}
        title={
          environments.length === 0
            ? "Create a project environment before adding a database"
            : "Add database"
        }
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CircleStackIcon className="size-4" aria-hidden="true" />
        Add database
      </button>

      {isOpen && (
        <AppDialog
          open
          onClose={() => setIsOpen(false)}
          title={
            type ? `Configure ${selectedOption?.label}` : "Choose a database"
          }
          description={
            type
              ? "Review the defaults and create the database."
              : "Select the database service to add to this project."
          }
          headerActions={
            type ? (
              <button
                type="button"
                onClick={() => setType(null)}
                className="rounded p-1 text-gray-400"
              >
                <span className="sr-only">Choose another database</span>
                <ArrowLeftIcon className="size-4" />
              </button>
            ) : null
          }
        >
          <form action={formAction}>
            {!type ? (
              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {databaseOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectDatabase(option)}
                    className="group flex min-h-28 flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-center hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-white/10 dark:bg-gray-800/40 dark:hover:border-indigo-400/60 dark:hover:bg-indigo-500/5"
                  >
                    <span
                      className={`flex size-11 items-center justify-center rounded-lg ${option.color}`}
                    >
                      <Image
                        src={option.logo}
                        alt=""
                        width={28}
                        height={28}
                        unoptimized
                        className="size-7 object-contain"
                      />
                    </span>
                    <span className="text-sm font-semibold text-gray-800 group-hover:text-indigo-600 dark:text-gray-200 dark:group-hover:text-indigo-300">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
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
                        onChange={(event) =>
                          setDatabaseName(event.target.value)
                        }
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
                        onChange={(event) =>
                          setDatabaseUser(event.target.value)
                        }
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
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setType(null)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pending ? "Creating…" : "Create database"}
                  </button>
                </div>
              </>
            )}
          </form>
        </AppDialog>
      )}
    </>
  );
}
