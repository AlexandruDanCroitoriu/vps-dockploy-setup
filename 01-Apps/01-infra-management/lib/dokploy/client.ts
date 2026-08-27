import "server-only";

import { DokployApiError } from "./errors";
import { getActiveDokployConfiguration } from "./active-instance";
import { clearDokployRenderSnapshots } from "./render-snapshot-cache";
import {
  getExternalRequestSnapshot,
  invalidateDokployMemoryState,
} from "./instance-memory-state";

export class NoActiveDokployInstanceError extends Error {
  constructor() {
    super("No Dockploy instance is selected.");
    this.name = "NoActiveDokployInstanceError";
  }
}

export async function dokployRequestWithConfiguration(
  configuration: { baseUrl: string; apiKey: string },
  endpoint: string,
  init?: RequestInit,
) {
  const { baseUrl, apiKey } = configuration;
  const method = init?.method?.toUpperCase() ?? "GET";
  const requestUrl = `${baseUrl}/api/${endpoint}`;
  const displayUrl = getSafeDokployRequestUrl(requestUrl);
  const startedAt = performance.now();

  console.info(`[Dokploy] → ${method} ${displayUrl}`);

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...init,
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (error) {
    console.info(
      `[Dokploy] ✕ ${method} ${displayUrl} transport-error ${formatDuration(startedAt)}`,
    );
    throw error;
  }

  const requestSummary = `${method} ${displayUrl} ${response.status} ${formatDuration(startedAt)}`;

  if (!response.ok) {
    console.info(`[Dokploy] ✕ ${requestSummary}`);
    const details = await response.text().catch(() => "");
    throw new DokployApiError(
      `Dokploy request failed (${response.status}).`,
      response.status,
      endpoint,
      details || response.statusText,
    );
  }

  console.info(`[Dokploy] ✓ ${requestSummary}`);
  return response;
}

function formatDuration(startedAt: number) {
  return `${Math.round(performance.now() - startedAt)}ms`;
}

function getSafeDokployRequestUrl(requestUrl: string) {
  const url = new URL(requestUrl);
  for (const key of url.searchParams.keys()) {
    if (/(?:api.?key|token|password|secret|credential)/i.test(key)) {
      url.searchParams.set(key, "[redacted]");
    }
  }
  return url.toString();
}

export async function dokployRequest(endpoint: string, init?: RequestInit) {
  const instance = await getActiveDokployConfiguration();
  if (!instance) throw new NoActiveDokployInstanceError();
  try {
    return await dokployRequestWithConfiguration(
      { baseUrl: instance.apiBaseUrl, apiKey: instance.apiKey },
      endpoint,
      init,
    );
  } catch (error) {
    if (!instance.apiFallbackUrl || error instanceof DokployApiError)
      throw error;
    return dokployRequestWithConfiguration(
      { baseUrl: instance.apiFallbackUrl, apiKey: instance.apiKey },
      endpoint,
      init,
    );
  }
}

export async function verifyDokployConnection(configuration: {
  baseUrl: string;
  apiKey: string;
}) {
  await dokployRequestWithConfiguration(configuration, "project.all");
}

export async function dokployGetWithConfiguration<T = unknown>(
  configuration: { baseUrl: string; apiKey: string },
  endpoint: string,
): Promise<T> {
  const response = await dokployRequestWithConfiguration(
    configuration,
    endpoint,
  );
  return response.json() as Promise<T>;
}

export async function dokployPostWithConfiguration<T = unknown>(
  configuration: { baseUrl: string; apiKey: string },
  endpoint: string,
  body: unknown,
): Promise<T> {
  const response = await dokployRequestWithConfiguration(
    configuration,
    endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function dokployGet<T = unknown>(endpoint: string): Promise<T> {
  const instance = await getActiveDokployConfiguration();
  if (!instance) throw new NoActiveDokployInstanceError();
  return getExternalRequestSnapshot(instance.id, endpoint, async () => {
    const response = await dokployRequest(endpoint);
    return response.json() as Promise<T>;
  });
}

export async function dokployGetFresh<T = unknown>(
  endpoint: string,
): Promise<T> {
  const response = await dokployRequest(endpoint);
  return response.json() as Promise<T>;
}

export async function dokployPost<T = unknown>(
  endpoint: string,
  body: unknown,
): Promise<T> {
  const response = await dokployRequest(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const instance = await getActiveDokployConfiguration();
  if (instance) {
    invalidateDokployMemoryState(instance.id);
    clearDokployRenderSnapshots(instance.id);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
