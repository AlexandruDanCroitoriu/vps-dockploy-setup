import "server-only";

import {
  getActiveZotRegistry,
  type ActiveZotRegistry,
} from "./active-registry";
import { getZotRegistryImages } from "./registry-images";

export const VENDURE_BACKEND_IMAGE_REPOSITORY = "online-store-vendure-server";

export type VendureBackendZotImageResult =
  | { available: true; image: string; registry: ActiveZotRegistry; message: "" }
  | { available: false; image: ""; registry: null; message: string };

export async function getVendureBackendZotImage(): Promise<VendureBackendZotImageResult> {
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
    const images = await getZotRegistryImages(
      registry,
      VENDURE_BACKEND_IMAGE_REPOSITORY,
    );
    if (!images.some((image) => image.tag === "latest")) {
      return {
        available: false,
        image: "",
        registry: null,
        message: `Zot registry does not contain ${VENDURE_BACKEND_IMAGE_REPOSITORY}:latest.`,
      };
    }
    return {
      available: true,
      image: `${registry.host}/${VENDURE_BACKEND_IMAGE_REPOSITORY}:latest`,
      registry,
      message: "",
    };
  } catch {
    return {
      available: false,
      image: "",
      registry: null,
      message: `Unable to verify ${VENDURE_BACKEND_IMAGE_REPOSITORY}:latest in Zot.`,
    };
  }
}
