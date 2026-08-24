import "server-only";

import { randomUUID } from "node:crypto";
import type {
  DokployBootstrapStep,
  DokployBootstrapStepStatus,
} from "@/lib/vps/bootstrap-progress";
import { getDatabase } from "./database";

export type DokployProvisioningJob = {
  id: string;
  instanceId: string;
  name: string;
  rootUrl: string;
  rootDomain: string;
  vpsIp: string;
  defaultServiceUsername: string;
  defaultServicePassword: string;
  apiKey: string;
  status: "running" | "failed" | "complete";
  steps: Partial<Record<DokployBootstrapStep, DokployBootstrapStepStatus>>;
  logs: Partial<Record<DokployBootstrapStep, string[]>>;
  error: string;
  updatedAt: string;
};

type JobRow = {
  id: string; instance_id: string | null; name: string; root_url: string;
  root_domain: string; vps_ip: string; default_service_username: string;
  default_service_password: string; api_key: string; status: DokployProvisioningJob["status"];
  steps_json: string; logs_json: string; error: string; updated_at: string;
};

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function toJob(row: JobRow): DokployProvisioningJob {
  return {
    id: row.id, instanceId: row.instance_id ?? "", name: row.name,
    rootUrl: row.root_url, rootDomain: row.root_domain, vpsIp: row.vps_ip,
    defaultServiceUsername: row.default_service_username,
    defaultServicePassword: row.default_service_password, apiKey: row.api_key,
    status: row.status,
    steps: parseJson(row.steps_json, {}), logs: parseJson(row.logs_json, {}),
    error: row.error, updatedAt: row.updated_at,
  };
}

export function getLatestDokployProvisioningJob() {
  const row = getDatabase().prepare(
    `SELECT id, instance_id, name, root_url, root_domain, vps_ip,
            default_service_username, default_service_password, api_key, status,
            steps_json, logs_json, error, updated_at
     FROM dokploy_provisioning_jobs ORDER BY updated_at DESC LIMIT 1`,
  ).get() as JobRow | undefined;
  return row ? toJob(row) : null;
}

export function getDokployProvisioningJob(id: string) {
  const row = getDatabase().prepare(
    `SELECT id, instance_id, name, root_url, root_domain, vps_ip,
            default_service_username, default_service_password, api_key, status,
            steps_json, logs_json, error, updated_at
     FROM dokploy_provisioning_jobs WHERE id = ?`,
  ).get(id) as JobRow | undefined;
  return row ? toJob(row) : null;
}

export function startDokployProvisioningJob(input: {
  name: string; rootUrl: string; rootDomain: string; vpsIp: string;
  vpsPassword: string; defaultServiceUsername: string; defaultServicePassword: string;
}) {
  const existing = getDatabase()
    .prepare(
      `SELECT id, instance_id, name, root_url, root_domain, vps_ip,
              default_service_username, default_service_password, api_key,
              status, steps_json, logs_json, error, updated_at
       FROM dokploy_provisioning_jobs WHERE root_url = ?`,
    )
    .get(input.rootUrl) as JobRow | undefined;
  const id = existing?.id ?? randomUUID();
  const now = new Date().toISOString();
  getDatabase().prepare(`INSERT INTO dokploy_provisioning_jobs
    (id, name, root_url, root_domain, vps_ip, vps_password,
     default_service_username, default_service_password, api_key, status,
     steps_json, logs_json, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'running', ?, ?, '', ?, ?)
    ON CONFLICT(root_url) DO UPDATE SET name=excluded.name, root_domain=excluded.root_domain,
      vps_ip=excluded.vps_ip, vps_password=excluded.vps_password,
      default_service_username=excluded.default_service_username,
      default_service_password=excluded.default_service_password,
      instance_id=NULL, api_key='', status='running', steps_json=excluded.steps_json,
      logs_json=excluded.logs_json, error='', updated_at=excluded.updated_at`).run(
        id, input.name, input.rootUrl, input.rootDomain, input.vpsIp, input.vpsPassword,
        input.defaultServiceUsername, input.defaultServicePassword,
        JSON.stringify({}), JSON.stringify({}), now, now,
      );
  return getDokployProvisioningJob(id)!;
}

export function updateDokployProvisioningJob(
  id: string,
  patch: { step?: DokployBootstrapStep; stepStatus?: DokployBootstrapStepStatus;
    log?: { step: DokployBootstrapStep; message: string }; apiKey?: string;
    status?: DokployProvisioningJob["status"]; error?: string; instanceId?: string },
) {
  const job = getDokployProvisioningJob(id);
  if (!job) return null;
  if (patch.step && patch.stepStatus) job.steps[patch.step] = patch.stepStatus;
  if (patch.log) {
    const entries = job.logs[patch.log.step] ?? [];
    if (entries.at(-1) !== patch.log.message) {
      job.logs[patch.log.step] = [...entries, patch.log.message].slice(-200);
    }
  }
  getDatabase().prepare(`UPDATE dokploy_provisioning_jobs SET instance_id=?, api_key=?,
    status=?, steps_json=?, logs_json=?, error=?, updated_at=? WHERE id=?`).run(
      (patch.instanceId ?? job.instanceId) || null, patch.apiKey ?? job.apiKey,
      patch.status ?? job.status, JSON.stringify(job.steps), JSON.stringify(job.logs),
      patch.error ?? job.error, new Date().toISOString(), id,
    );
  return getDokployProvisioningJob(id);
}
