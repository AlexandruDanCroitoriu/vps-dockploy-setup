import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { resolveDokployLiveStatus } from "./services";
import type { DokployService } from "./types";

const service: DokployService = {
  id: "compose-1",
  name: "Compose",
  appName: "compose-app",
  env: "",
  serverId: null,
  type: "compose",
  status: "down",
  credentials: [],
};

describe("live service status", () => {
  it("detects a running compose container", async () => {
    await expect(
      resolveDokployLiveStatus({ ...service }, async () => ({
        containers: [{ State: "running" }],
      })),
    ).resolves.toMatchObject({ status: "running" });
  });

  it("maps missing and malformed containers to down", async () => {
    await expect(
      resolveDokployLiveStatus({ ...service }, async () => ({
        malformed: true,
      })),
    ).resolves.toMatchObject({ status: "down" });
  });

  it("preserves the known status when Docker is unreachable", async () => {
    await expect(
      resolveDokployLiveStatus({ ...service, status: "running" }, async () => {
        throw new Error("Docker unavailable");
      }),
    ).resolves.toMatchObject({ status: "running" });
  });
});
