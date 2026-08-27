import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dokploy/client", () => ({
  dokployGetWithConfiguration: vi.fn(),
}));
vi.mock("@/lib/storage/dokploy-instances", () => ({
  getDokployInstance: vi.fn(),
  listDokployInstances: vi.fn(),
}));

import { dokployGetWithConfiguration } from "@/lib/dokploy/client";
import {
  getDokployInstance,
  listDokployInstances,
} from "@/lib/storage/dokploy-instances";
import {
  getInstanceZotRegistries,
  getInstanceZotRegistry,
} from "./instance-registries";

const instance = {
  id: "instance-1",
  name: "Production",
  rootUrl: "https://dokploy.example.com",
  rootDomain: "example.com",
  vpsIp: "192.0.2.1",
  vpsPassword: "vps-password",
  apiKey: "api-key",
  defaultServiceUsername: "operator@example.com",
  defaultServicePassword: "registry-password",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDokployInstance).mockReturnValue(instance);
  vi.mocked(listDokployInstances).mockReturnValue([instance]);
});

describe("instance Zot registries", () => {
  it("resolves a registry and credentials for a specific instance", async () => {
    const project = {
      projectId: "main-project",
      name: "Main",
      environments: [
        {
          environmentId: "production",
          name: "Production",
          compose: [{ composeId: "zot-1", name: "Zot" }],
        },
      ],
    };
    vi.mocked(dokployGetWithConfiguration)
      .mockResolvedValueOnce([project])
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce([
        {
          domainId: "domain-1",
          host: "zot.example.com",
          https: true,
          enabled: true,
          serviceName: "zot",
        },
      ]);

    await expect(getInstanceZotRegistry(instance.id)).resolves.toEqual({
      host: "zot.example.com",
      username: "operator@example.com",
      password: "registry-password",
    });
  });

  it("keeps configured instances visible when Zot is unavailable", async () => {
    vi.mocked(dokployGetWithConfiguration).mockRejectedValue(
      new Error("unavailable"),
    );

    await expect(getInstanceZotRegistries()).resolves.toEqual([
      {
        instanceId: "instance-1",
        instanceName: "Production",
        registry: null,
      },
    ]);
  });
});
