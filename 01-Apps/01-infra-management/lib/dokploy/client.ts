import "server-only";

import { DokployApiError } from "./errors";

function getDokployConfiguration() {
  const baseUrl = process.env.DOKPLOY_URL;
  const apiKey = process.env.DOKPLOY_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("DOKPLOY_URL or DOKPLOY_API_KEY is not configured.");
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export async function dokployRequest(endpoint: string, init?: RequestInit) {
  const { baseUrl, apiKey } = getDokployConfiguration();
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
