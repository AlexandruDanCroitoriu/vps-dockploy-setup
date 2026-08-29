import "server-only";

import {
  getActiveZotRegistry,
  type ActiveZotRegistry,
} from "./active-registry";
import { getZotRegistryImages } from "./registry-images";

const STOREFRONT_IMAGE_REPOSITORIES = {
  "/01-Apps/02-Online-Store-Vendure/apps/storefront":
    "online-store-vendure-storefront",
  "/01-Apps/02-Online-Store-Vendure/apps/storefront-clean":
    "online-store-vendure-storefront-clean",
} as const;

export type VendureStorefrontPath = keyof typeof STOREFRONT_IMAGE_REPOSITORIES;

export type VendureStorefrontZotImageResult =
  | { available: true; image: string; registry: ActiveZotRegistry; message: "" }
  | { available: false; image: ""; registry: null; message: string };

export function isVendureStorefrontPath(
  path: string,
): path is VendureStorefrontPath {
  return path in STOREFRONT_IMAGE_REPOSITORIES;
}

export async function getVendureStorefrontZotImage(
  path: VendureStorefrontPath,
): Promise<VendureStorefrontZotImageResult> {
  const repository = STOREFRONT_IMAGE_REPOSITORIES[path];
  try {
    const registry = await getActiveZotRegistry();
    if (!registry) {
      return {
        available: false,
        image: "",
        registry: null,
        message: "Zot registry is not available on the active instance.",
      };
    }
    const images = await getZotRegistryImages(registry, repository);
    if (!images.some((image) => image.tag === "latest")) {
      return {
        available: false,
        image: "",
        registry: null,
        message: `Zot registry does not contain ${repository}:latest.`,
      };
    }
    return {
      available: true,
      image: `${registry.host}/${repository}:latest`,
      registry,
      message: "",
    };
  } catch {
    return {
      available: false,
      image: "",
      registry: null,
      message: `Unable to verify ${repository}:latest in Zot.`,
    };
  }
}
