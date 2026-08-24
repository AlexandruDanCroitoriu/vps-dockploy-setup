import "server-only";

import { getProjectImageRepository } from "@/lib/repository-projects";

import {
  getActiveZotRegistry,
  type ActiveZotRegistry,
} from "./active-registry";
import { getZotRegistryImages } from "./registry-images";

export const INFRA_MANAGEMENT_PROJECT_NAME = "01-infra-management";
export const INFRA_MANAGEMENT_IMAGE_REPOSITORY = getProjectImageRepository(
  INFRA_MANAGEMENT_PROJECT_NAME,
);

export type InfraManagementZotImageResult =
  | {
      available: true;
      image: string;
      registry: ActiveZotRegistry;
      message: "";
    }
  | {
      available: false;
      image: "";
      registry: null;
      message: string;
    };

export async function getInfraManagementZotImage(): Promise<InfraManagementZotImageResult> {
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
      INFRA_MANAGEMENT_IMAGE_REPOSITORY,
    );
    if (!images.some((image) => image.tag === "latest")) {
      return {
        available: false,
        image: "",
        registry: null,
        message: `Zot registry does not contain ${INFRA_MANAGEMENT_IMAGE_REPOSITORY}:latest.`,
      };
    }

    return {
      available: true,
      image: `${registry.host}/${INFRA_MANAGEMENT_IMAGE_REPOSITORY}:latest`,
      registry,
      message: "",
    };
  } catch {
    return {
      available: false,
      image: "",
      registry: null,
      message: `Unable to verify ${INFRA_MANAGEMENT_IMAGE_REPOSITORY}:latest in Zot.`,
    };
  }
}
