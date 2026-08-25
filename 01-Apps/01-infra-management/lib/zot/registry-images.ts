import "server-only";

import type { ActiveZotRegistry } from "./active-registry";
import {
  getExternalRequestSnapshot,
  invalidateDokployMemoryState,
} from "@/lib/dokploy/instance-memory-state";

export type ZotRegistryImage = {
  name: string;
  tag: string;
  digest: string;
  publishedAt: string;
  current: boolean;
};

type ZotImageListResponse = {
  data?: {
    ImageList?: {
      Results?: Array<{
        RepoName?: unknown;
        Tag?: unknown;
        Digest?: unknown;
        PushTimestamp?: unknown;
        TaggedTimestamp?: unknown;
        LastUpdated?: unknown;
      }>;
    };
  };
  errors?: Array<{ message?: unknown }>;
};

const imageListQuery = `
  query RepositoryImages($repository: String!) {
    ImageList(repo: $repository) {
      Results {
        RepoName
        Tag
        Digest
        PushTimestamp
        TaggedTimestamp
        LastUpdated
      }
    }
  }
`;

export function normalizeZotRegistryImages(
  payload: ZotImageListResponse,
): ZotRegistryImage[] {
  const images = (payload.data?.ImageList?.Results ?? [])
    .flatMap((image): ZotRegistryImage[] => {
      const name = typeof image.RepoName === "string" ? image.RepoName : "";
      const tag = typeof image.Tag === "string" ? image.Tag : "";
      const digest = typeof image.Digest === "string" ? image.Digest : "";
      const publishedAt = [
        image.TaggedTimestamp,
        image.PushTimestamp,
        image.LastUpdated,
      ].find(
        (value): value is string => typeof value === "string" && Boolean(value),
      );

      return name && tag
        ? [
            {
              name,
              tag,
              digest,
              publishedAt: publishedAt ?? "",
              current: false,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    );
  const currentDigest =
    images.find((image) => image.tag === "latest")?.digest ?? images[0]?.digest;
  const groups = new Map<string, ZotRegistryImage[]>();
  for (const image of images) {
    groups.set(image.digest, [...(groups.get(image.digest) ?? []), image]);
  }

  return [...groups.entries()]
    .map(([digest, tags]) => {
      const current = digest === currentDigest;
      const selected =
        (current ? tags.find((image) => image.tag === "latest") : undefined) ??
        tags.find((image) => image.tag.startsWith("build-")) ??
        tags[0];
      return { ...selected, current };
    })
    .sort((left, right) => {
      if (left.current !== right.current) return left.current ? -1 : 1;
      return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    });
}

export async function getZotRegistryImages(
  registry: ActiveZotRegistry,
  repository: string,
) {
  return getExternalRequestSnapshot(
    getZotMemoryId(registry.host),
    `images:${repository}`,
    async () => {
      const response = await fetch(
        `https://${registry.host}/v2/_zot/ext/search`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${registry.username}:${registry.password}`).toString("base64")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: imageListQuery,
            variables: { repository },
          }),
          cache: "no-store",
        },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as ZotImageListResponse | null;
      if (!response.ok || !payload || payload.errors?.length) {
        throw new Error("Unable to load images from Zot.");
      }
      return normalizeZotRegistryImages(payload);
    },
  );
}

export async function deleteZotRegistryImage(
  registry: ActiveZotRegistry,
  repository: string,
  reference: string,
) {
  const repositoryPath = repository
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const response = await fetch(
    `https://${registry.host}/v2/${repositoryPath}/manifests/${encodeURIComponent(reference)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${Buffer.from(`${registry.username}:${registry.password}`).toString("base64")}`,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(
      detail
        ? `Zot rejected ${repository}:${reference} (HTTP ${response.status}): ${detail.slice(0, 300)}`
        : `Zot rejected ${repository}:${reference} with HTTP ${response.status}.`,
    );
  }
  invalidateZotRegistryMemoryState(registry.host);
}

export function invalidateZotRegistryMemoryState(host: string) {
  invalidateDokployMemoryState(getZotMemoryId(host));
}

function getZotMemoryId(host: string) {
  return `zot:${host}`;
}
