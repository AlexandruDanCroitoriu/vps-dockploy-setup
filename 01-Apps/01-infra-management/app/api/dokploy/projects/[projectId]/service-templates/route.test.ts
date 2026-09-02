import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("@/app/(dashboard)/dokploy/_actions/databases", () => ({
  createDatabaseAction: vi.fn(),
}));
vi.mock("@/app/(dashboard)/dokploy/_actions/applications", () => ({
  createApplicationAction: vi.fn(),
}));
vi.mock("@/app/(dashboard)/dokploy/_actions/composes", () => ({
  createComposeAction: vi.fn(),
}));
vi.mock("@/lib/zot/vendure-backend-image", () => ({
  getVendureBackendZotImage: vi.fn(),
}));
vi.mock("@/lib/zot/vendure-storefront-image", () => ({
  getVendureStorefrontZotImage: vi.fn(),
}));
vi.mock("@/lib/dokploy/vendure-backups", () => ({
  configureVendureBackups: vi.fn(),
}));
vi.mock("@/lib/dokploy", () => ({
  getActiveDokployConfiguration: vi.fn(),
  getDokployProject: vi.fn(),
  getFreshDokployProject: vi.fn(),
  isValidHostname: (value: string) =>
    value === "example.com" || value.endsWith(".example.com"),
  mergeDokployProjectEnv: vi.fn((current: string) => current),
  parseDokployEnvironmentEntries: vi.fn(() => ({
    S3_ACCESS_KEY_ID: "garage-access-key",
    S3_SECRET_ACCESS_KEY: "garage-secret-key",
  })),
  updateDokployProjectEnv: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { createApplicationAction } from "@/app/(dashboard)/dokploy/_actions/applications";
import { createComposeAction } from "@/app/(dashboard)/dokploy/_actions/composes";
import { createDatabaseAction } from "@/app/(dashboard)/dokploy/_actions/databases";
import { getVendureBackendZotImage } from "@/lib/zot/vendure-backend-image";
import { getVendureStorefrontZotImage } from "@/lib/zot/vendure-storefront-image";
import { configureVendureBackups } from "@/lib/dokploy/vendure-backups";
import {
  getActiveDokployConfiguration,
  getDokployProject,
  getFreshDokployProject,
} from "@/lib/dokploy";
import { POST } from "./route";

describe("service template route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { name: "admin" } });
    vi.mocked(getDokployProject).mockResolvedValue({
      projectId: "project-1",
      name: "Project",
      description: null,
      createdAt: "",
      env: "",
      environments: [
        { environmentId: "environment-1", name: "production", services: [] },
      ],
    });
    vi.mocked(getActiveDokployConfiguration).mockResolvedValue({
      id: "instance-1",
      name: "Dokploy",
      rootUrl: "https://example.com",
      apiBaseUrl: "https://example.com",
      apiFallbackUrl: "http://203.0.113.10:3000",
      apiKey: "secret",
      rootDomain: "example.com",
      vpsIp: "203.0.113.10",
      vpsPassword: "root-password",
      defaultServiceUsername: "operator",
      defaultServicePassword: "login-secret",
    });
    vi.mocked(getFreshDokployProject).mockResolvedValue({
      projectId: "project-1",
      name: "Project",
      description: null,
      createdAt: "",
      env: "",
      environments: [
        { environmentId: "environment-1", name: "production", services: [] },
      ],
    });
    vi.mocked(getVendureBackendZotImage).mockResolvedValue({
      available: true,
      image: "zot.example.com/online-store-vendure-server:latest",
      registry: {} as never,
      message: "",
    });
    vi.mocked(getVendureStorefrontZotImage).mockResolvedValue({
      available: true,
      image: "zot.example.com/storefront:latest",
      registry: {} as never,
      message: "",
    });
  });

  it("creates and deploys PostgreSQL and Redis before DBGate and Garage", async () => {
    vi.mocked(createDatabaseAction)
      .mockResolvedValueOnce({
        status: "success",
        message: "created",
        createdService: { id: "postgres-1", type: "postgres" },
      })
      .mockResolvedValueOnce({
        status: "success",
        message: "created",
        createdService: { id: "redis-1", type: "redis" },
      });
    vi.mocked(createComposeAction)
      .mockResolvedValueOnce({
        status: "success",
        message: "created",
        createdService: { id: "dbgate-1", type: "compose" },
      })
      .mockResolvedValueOnce({
        status: "success",
        message: "created",
        createdService: { id: "garage-1", type: "compose" },
      });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ templateId: "postgres-redis-dbgate" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    const firstDatabaseForm = vi.mocked(createDatabaseAction).mock.calls[0][2];
    const secondDatabaseForm = vi.mocked(createDatabaseAction).mock.calls[1][2];
    expect(firstDatabaseForm.get("type")).toBe("postgres");
    expect(secondDatabaseForm.get("type")).toBe("redis");
    expect(firstDatabaseForm.get("deployAfterCreate")).toBe("on");
    const composeForm = vi.mocked(createComposeAction).mock.calls[0][3];
    expect(composeForm.get("definitionId")).toBe("dbgate");
    expect(composeForm.get("loginUsername")).toBe("operator");
    expect(composeForm.get("loginPassword")).toBe("login-secret");
    expect(composeForm.get("host")).toBe("dbgate.example.com");
    expect(composeForm.get("deployAfterCreate")).toBe("on");
    const garageForm = vi.mocked(createComposeAction).mock.calls[1][3];
    expect(garageForm.get("definitionId")).toBe("garage-with-webui");
    expect(garageForm.get("garageCapacityGb")).toBe("20");
    expect(garageForm.get("loginUsername")).toBe("operator");
    expect(garageForm.get("loginPassword")).toBe("login-secret");
    expect(garageForm.get("host")).toBe("garage.example.com");
    expect(garageForm.get("s3Host")).toBe("s3.example.com");
    expect(garageForm.get("deployAfterCreate")).toBe("on");
    await expect(response.json()).resolves.toMatchObject({
      services: [
        { id: "postgres-1", type: "postgres" },
        { id: "redis-1", type: "redis" },
        { id: "dbgate-1", type: "compose" },
        { id: "garage-1", type: "compose", name: "Garage with UI" },
      ],
    });
  });

  it("rejects the template when one of its services already exists", async () => {
    vi.mocked(getDokployProject).mockResolvedValue({
      projectId: "project-1",
      name: "Project",
      description: null,
      createdAt: "",
      env: "",
      environments: [
        {
          environmentId: "environment-1",
          name: "production",
          services: [
            {
              id: "redis-1",
              name: "redis",
              appName: null,
              env: "",
              serverId: null,
              sourcePath: null,
              type: "redis",
              status: "running",
              credentials: [],
            },
          ],
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ templateId: "postgres-redis-dbgate" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    expect(createDatabaseAction).not.toHaveBeenCalled();
    expect(createComposeAction).not.toHaveBeenCalled();
  });

  it("creates the complete Vendure stack in dependency order", async () => {
    vi.mocked(createDatabaseAction).mockResolvedValue({
      status: "success",
      message: "created",
      createdService: { id: "postgres-1", type: "postgres" },
    });
    vi.mocked(createComposeAction).mockResolvedValue({
      status: "success",
      message: "created",
      createdService: { id: "garage-1", type: "compose" },
    });
    vi.mocked(createApplicationAction)
      .mockResolvedValueOnce({
        status: "success",
        message: "created",
        createdService: { id: "vendure-1", type: "applications" },
      })
      .mockResolvedValueOnce({
        status: "success",
        message: "created",
        createdService: { id: "storefront-clean-1", type: "applications" },
      })
      .mockResolvedValueOnce({
        status: "success",
        message: "created",
        createdService: { id: "storefront-1", type: "applications" },
      });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ templateId: "vendure-stack" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(createDatabaseAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createDatabaseAction).mock.calls[0][2].get("type")).toBe(
      "postgres",
    );
    expect(createComposeAction).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(createComposeAction).mock.calls[0][3].get("definitionId"),
    ).toBe("garage-with-webui");
    expect(createApplicationAction).toHaveBeenCalledTimes(3);
    expect(configureVendureBackups).toHaveBeenCalledWith({
      projectId: "project-1",
      postgresId: "postgres-1",
      bucket: "",
      prefix: "",
      backupTime: "03:00",
    });
    const backendForm = vi.mocked(createApplicationAction).mock.calls[0][2];
    const cleanForm = vi.mocked(createApplicationAction).mock.calls[1][2];
    const storefrontForm = vi.mocked(createApplicationAction).mock.calls[2][2];
    expect(backendForm.get("buildPath")).toBe(
      "/01-Apps/02-Online-Store-Vendure/apps/server",
    );
    expect(cleanForm.get("vendureBackendId")).toBe("vendure-1");
    expect(cleanForm.get("vendureTemplateProvisioning")).toBe("on");
    expect(storefrontForm.get("vendureChannelToken")).toBe(
      backendForm.get("vendureChannelToken"),
    );
    await expect(response.json()).resolves.toMatchObject({
      services: [
        { id: "postgres-1", name: "postgres" },
        { id: "garage-1", name: "Garage with UI" },
        { id: "vendure-1", name: "vendure" },
        { id: "storefront-clean-1", name: "vendure-storefront-clean" },
        { id: "storefront-1", name: "vendure-storefront" },
      ],
    });
  });

  it("does not create partial infrastructure when a Vendure image is unavailable", async () => {
    vi.mocked(getVendureBackendZotImage).mockResolvedValue({
      available: false,
      image: "",
      registry: null,
      message: "Zot does not contain the Vendure backend image.",
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ templateId: "vendure-stack" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    expect(createDatabaseAction).not.toHaveBeenCalled();
    expect(createComposeAction).not.toHaveBeenCalled();
    expect(createApplicationAction).not.toHaveBeenCalled();
  });

  it("rejects the removed standalone Garage template", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ templateId: "garage-with-webui" }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    expect(createDatabaseAction).not.toHaveBeenCalled();
    expect(createComposeAction).not.toHaveBeenCalled();
  });

  it("rejects an invalid Garage capacity before creating services", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          templateId: "postgres-redis-dbgate",
          garageCapacityGb: 0,
        }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    expect(createDatabaseAction).not.toHaveBeenCalled();
    expect(createComposeAction).not.toHaveBeenCalled();
  });
});
