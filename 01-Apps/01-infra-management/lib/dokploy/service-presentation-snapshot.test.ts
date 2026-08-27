import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./active-instance", () => ({
  getActiveDokployInstanceSummary: vi.fn(),
}));
vi.mock("./domains", () => ({ getDokployDomains: vi.fn() }));
vi.mock("./render-snapshot-cache", () => ({
  getDokployRenderSnapshot: vi.fn(),
}));
vi.mock("./services", () => ({
  getFreshDokployServiceStatus: vi.fn(),
  getDokployServiceStatus: vi.fn(),
  shouldPollDokployServiceStatus: vi.fn(),
}));

import { getActiveDokployInstanceSummary } from "./active-instance";
import { getDokployDomains } from "./domains";
import { getDokployRenderSnapshot } from "./render-snapshot-cache";
import {
  getFreshDokployServiceStatus,
  getDokployServiceStatus,
  shouldPollDokployServiceStatus,
} from "./services";
import { getServicePresentationSnapshot } from "./service-presentation-snapshot";
import type { DokployService } from "./types";

const service: DokployService = {
  id: "application-1",
  name: "Infra Management",
  appName: "infra-management",
  env: "",
  serverId: null,
  sourcePath: null,
  type: "applications",
  status: "deploying",
  credentials: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveDokployInstanceSummary).mockResolvedValue({
    id: "instance-1",
    name: "Production",
    rootUrl: "https://dokploy.example.com",
    rootDomain: "example.com",
  });
  vi.mocked(getDokployDomains).mockResolvedValue([]);
});

describe("service presentation snapshots", () => {
  it("checks transitional services live instead of reusing a cached deploying snapshot", async () => {
    vi.mocked(shouldPollDokployServiceStatus).mockReturnValue(true);
    vi.mocked(getFreshDokployServiceStatus).mockResolvedValue({
      ...service,
      status: "running",
    });

    await expect(
      getServicePresentationSnapshot("project-1", [service]),
    ).resolves.toMatchObject({ services: [{ status: "running" }] });
    expect(getDokployRenderSnapshot).not.toHaveBeenCalled();
    expect(getDokployServiceStatus).not.toHaveBeenCalled();
  });

  it("keeps stable services in the render cache", async () => {
    vi.mocked(shouldPollDokployServiceStatus).mockReturnValue(false);
    vi.mocked(getDokployRenderSnapshot).mockImplementation(
      async (_instanceId, _key, loader) => loader(),
    );
    vi.mocked(getDokployServiceStatus).mockResolvedValue({
      ...service,
      status: "running",
    });

    await getServicePresentationSnapshot("project-1", [
      { ...service, status: "running" },
    ]);
    expect(getDokployRenderSnapshot).toHaveBeenCalledOnce();
  });
});
