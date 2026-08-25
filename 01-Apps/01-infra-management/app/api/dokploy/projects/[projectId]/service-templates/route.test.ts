import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("@/app/(dashboard)/dokploy/_actions/databases", () => ({
  createDatabaseAction: vi.fn(),
}));
vi.mock("@/app/(dashboard)/dokploy/_actions/composes", () => ({
  createComposeAction: vi.fn(),
}));
vi.mock("@/lib/dokploy", () => ({
  getActiveDokployConfiguration: vi.fn(),
  getDokployProject: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { createComposeAction } from "@/app/(dashboard)/dokploy/_actions/composes";
import { createDatabaseAction } from "@/app/(dashboard)/dokploy/_actions/databases";
import {
  getActiveDokployConfiguration,
  getDokployProject,
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
