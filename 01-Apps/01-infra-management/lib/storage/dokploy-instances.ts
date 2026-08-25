import "server-only";

import { randomUUID } from "node:crypto";
import { getDatabase } from "./database";

export type DokployInstanceSummary = {
  id: string;
  name: string;
  rootUrl: string;
  rootDomain: string;
};

export type DokployInstanceConfiguration = DokployInstanceSummary & {
  vpsIp: string;
  vpsPassword: string;
  apiKey: string;
  defaultServiceUsername: string;
  defaultServicePassword: string;
};

type InstanceRow = {
  id: string;
  name: string;
  root_url: string;
  root_domain: string;
  vps_ip: string;
  vps_password: string;
  api_key: string;
  default_service_username: string;
  default_service_password: string;
};

type InstanceSummaryRow = Pick<
  InstanceRow,
  "id" | "name" | "root_url" | "root_domain"
>;

function toSummary(row: InstanceSummaryRow): DokployInstanceSummary {
  return {
    id: row.id,
    name: row.name,
    rootUrl: row.root_url,
    rootDomain: row.root_domain,
  };
}

function toConfiguration(row: InstanceRow): DokployInstanceConfiguration {
  return {
    ...toSummary(row),
    vpsIp: row.vps_ip,
    vpsPassword: row.vps_password,
    apiKey: row.api_key,
    defaultServiceUsername: row.default_service_username,
    defaultServicePassword: row.default_service_password,
  };
}

export function listDokployInstances(): DokployInstanceSummary[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, name, root_url, root_domain
       FROM dokploy_instances ORDER BY created_at, name`,
    )
    .all() as InstanceSummaryRow[];
  return rows.map(toSummary);
}

export function getDokployInstanceSummary(
  id: string,
): DokployInstanceSummary | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, name, root_url, root_domain
       FROM dokploy_instances WHERE id = ?`,
    )
    .get(id) as InstanceSummaryRow | undefined;
  return row ? toSummary(row) : null;
}

export function getDokployInstance(
  id: string,
): DokployInstanceConfiguration | null {
  const row = getDatabase()
    .prepare(
      `SELECT id, name, root_url, root_domain, vps_ip, vps_password, api_key,
              default_service_username, default_service_password
       FROM dokploy_instances WHERE id = ?`,
    )
    .get(id) as InstanceRow | undefined;
  return row ? toConfiguration(row) : null;
}

export function createDokployInstance(input: {
  name: string;
  rootUrl: string;
  rootDomain: string;
  vpsIp?: string;
  vpsPassword?: string;
  apiKey: string;
  defaultServiceUsername: string;
  defaultServicePassword: string;
}): DokployInstanceSummary {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  getDatabase()
    .prepare(
      `INSERT INTO dokploy_instances
       (id, name, root_url, root_domain, vps_ip, vps_password, api_key, default_service_username,
        default_service_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.rootUrl,
      input.rootDomain,
      input.vpsIp ?? "",
      input.vpsPassword ?? "",
      input.apiKey,
      input.defaultServiceUsername,
      input.defaultServicePassword,
      timestamp,
      timestamp,
    );
  return {
    id,
    name: input.name,
    rootUrl: input.rootUrl,
    rootDomain: input.rootDomain,
  };
}

export function updateDokployInstance(
  id: string,
  input: {
    name: string;
    rootUrl: string;
    rootDomain: string;
    vpsIp?: string;
    vpsPassword?: string;
    apiKey: string;
    defaultServiceUsername: string;
    defaultServicePassword: string;
  },
): DokployInstanceSummary | null {
  const result = getDatabase()
    .prepare(
      `UPDATE dokploy_instances
       SET name = ?, root_url = ?, root_domain = ?, vps_ip = ?, vps_password = ?, api_key = ?,
           default_service_username = ?, default_service_password = ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name,
      input.rootUrl,
      input.rootDomain,
      input.vpsIp ?? "",
      input.vpsPassword ?? "",
      input.apiKey,
      input.defaultServiceUsername,
      input.defaultServicePassword,
      new Date().toISOString(),
      id,
    );
  return result.changes > 0
    ? {
        id,
        name: input.name,
        rootUrl: input.rootUrl,
        rootDomain: input.rootDomain,
      }
    : null;
}

export function deleteDokployInstance(id: string) {
  const database = getDatabase();
  return database.transaction(() => {
    database
      .prepare("DELETE FROM dokploy_provisioning_jobs WHERE instance_id = ?")
      .run(id);
    return (
      database.prepare("DELETE FROM dokploy_instances WHERE id = ?").run(id)
        .changes > 0
    );
  })();
}

export function bootstrapLegacyDokployInstance() {
  const database = getDatabase();
  const count = database
    .prepare("SELECT COUNT(*) count FROM dokploy_instances")
    .get() as { count: number };
  if (count.count > 0) return;

  const rootUrl = process.env.DOKPLOY_URL?.trim();
  const apiKey = process.env.DOKPLOY_API_KEY?.trim();
  if (!rootUrl || !apiKey) return;

  let name = process.env.DOKPLOY_NAME?.trim();
  if (!name) {
    try {
      name = new URL(rootUrl).hostname;
    } catch {
      return;
    }
  }
  try {
    createDokployInstance({
      name,
      rootUrl: normalizeDokployUrl(rootUrl),
      rootDomain: getRootDomainFromLegacyUrl(rootUrl),
      apiKey,
      defaultServiceUsername: "admin",
      defaultServicePassword: "admin",
    });
  } catch (error) {
    // Concurrent first requests may both attempt the one-time import.
    if (!isDuplicateInstanceError(error)) throw error;
  }
}

export function normalizeDokployUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Dockploy URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "Dockploy URL cannot contain credentials, a query, or a fragment.",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

export function normalizeRootDomain(value: string) {
  const rootDomain = value.trim().toLowerCase().replace(/\.$/, "");
  if (
    !rootDomain ||
    rootDomain.length > 253 ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      rootDomain,
    )
  ) {
    throw new Error("Enter a valid root domain.");
  }
  return rootDomain;
}

export function getDokployUrlFromRootDomain(rootDomain: string) {
  return `https://dockploy.${normalizeRootDomain(rootDomain)}`;
}

function getRootDomainFromLegacyUrl(value: string) {
  return new URL(normalizeDokployUrl(value)).hostname.replace(
    /^dockploy\./,
    "",
  );
}

export function isDuplicateInstanceError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes(
      "UNIQUE constraint failed: dokploy_instances.root_url",
    )
  );
}
