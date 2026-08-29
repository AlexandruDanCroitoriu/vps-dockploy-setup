import { describe, expect, it } from "vitest";
import { registryHasLocalImage } from "./project-image-publication";

describe("registryHasLocalImage", () => {
  it("keeps a previous local build published when Zot still tags it latest", () => {
    expect(
      registryHasLocalImage(
        [
          {
            digest: "sha256:manifest-old",
            configDigest: "sha256:image-old",
          },
        ],
        {
          identifier: "sha256:image-old",
          digests: [],
        },
      ),
    ).toBe(true);
  });

  it("does not mark a newer local build as published", () => {
    expect(
      registryHasLocalImage(
        [
          {
            digest: "sha256:manifest-old",
            configDigest: "sha256:image-old",
          },
        ],
        {
          identifier: "sha256:image-new",
          digests: [],
        },
      ),
    ).toBe(false);
  });
});
