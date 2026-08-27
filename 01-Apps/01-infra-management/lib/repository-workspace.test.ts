import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  areProjectBuildsEnabled,
  getManagedRepositoryPath,
} from "./repository-workspace";

const originalEnabled = process.env.PROJECT_BUILDS_ENABLED;
const originalPath = process.env.PROJECT_REPOSITORY_PATH;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.PROJECT_BUILDS_ENABLED;
  else process.env.PROJECT_BUILDS_ENABLED = originalEnabled;
  if (originalPath === undefined) delete process.env.PROJECT_REPOSITORY_PATH;
  else process.env.PROJECT_REPOSITORY_PATH = originalPath;
});

describe("project build workspace", () => {
  it("enables explicitly configured project builds", () => {
    process.env.PROJECT_BUILDS_ENABLED = "true";
    expect(areProjectBuildsEnabled()).toBe(true);
  });

  it("uses the configured managed checkout path", () => {
    process.env.PROJECT_REPOSITORY_PATH = "/tmp/infra-repository";
    expect(getManagedRepositoryPath()).toBe("/tmp/infra-repository");
  });
});
