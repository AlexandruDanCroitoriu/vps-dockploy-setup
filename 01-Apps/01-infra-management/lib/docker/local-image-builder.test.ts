import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  collapseLocalDockerImages,
  createBuildVersionTag,
  isValidDockerTag,
} from "./local-image-builder";

describe("local Docker image validation", () => {
  it("accepts standard image tags and rejects unsafe values", () => {
    expect(isValidDockerTag("v1.2.3-rc1")).toBe(true);
    expect(isValidDockerTag("latest")).toBe(true);
    expect(isValidDockerTag("bad tag")).toBe(false);
    expect(isValidDockerTag("--output=/tmp/result")).toBe(false);
  });

  it("keeps latest first and collapses immutable tags for the same build", () => {
    expect(
      collapseLocalDockerImages([
        {
          name: "infra-management",
          tag: "build-20260823T100000000Z",
          imageId: "sha256:old",
          createdAt: "2026-08-23T10:00:00Z",
          current: false,
        },
        {
          name: "infra-management",
          tag: "build-20260824T100000000Z",
          imageId: "sha256:new",
          createdAt: "2026-08-24T10:00:00Z",
          current: false,
        },
        {
          name: "infra-management",
          tag: "latest",
          imageId: "sha256:new",
          createdAt: "2026-08-24T10:00:00Z",
          current: false,
        },
      ]),
    ).toEqual([
      expect.objectContaining({ tag: "latest", current: true }),
      expect.objectContaining({
        tag: "build-20260823T100000000Z",
        current: false,
      }),
    ]);
  });

  it("creates a Docker-safe immutable build tag", () => {
    expect(createBuildVersionTag(new Date("2026-08-24T10:00:00.123Z"))).toBe(
      "build-20260824T100000123Z",
    );
  });
});
