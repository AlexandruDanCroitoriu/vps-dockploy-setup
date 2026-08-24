import "server-only";

import { DokployApiError } from "./errors";
import { getActiveDokployConfiguration } from "./active-instance";

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
  const response = await fetch(`${baseUrl}/api/${endpoint}`, {
    ...init,
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new DokployApiError(
      `Dokploy request failed (${response.status}).`,
      response.status,
      endpoint,
      details || response.statusText,
    );
  }

  return response;
}

export async function dokployRequest(endpoint: string, init?: RequestInit) {
  const instance = await getActiveDokployConfiguration();
  if (!instance) throw new NoActiveDokployInstanceError();
  return dokployRequestWithConfiguration(
    { baseUrl: instance.rootUrl, apiKey: instance.apiKey },
    endpoint,
    init,
  );
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

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
