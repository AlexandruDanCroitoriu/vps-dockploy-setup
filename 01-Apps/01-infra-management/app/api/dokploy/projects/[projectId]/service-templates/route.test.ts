import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("@/app/(dashboard)/projects/_actions/databases", () => ({
  createDatabaseAction: vi.fn(),
}));
vi.mock("@/app/(dashboard)/projects/_actions/composes", () => ({
  createComposeAction: vi.fn(),
}));
vi.mock("@/lib/dokploy", () => ({
  getActiveDokployConfiguration: vi.fn(),
  getDokployProject: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { createComposeAction } from "@/app/(dashboard)/projects/_actions/composes";
import { createDatabaseAction } from "@/app/(dashboard)/projects/_actions/databases";
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
      apiKey: "secret",
      rootDomain: "example.com",
      defaultServiceUsername: "operator",
      defaultServicePassword: "login-secret",
    });
  });

  it("creates and deploys PostgreSQL and Redis before DBGate", async () => {
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
    vi.mocked(createComposeAction).mockResolvedValue({
      status: "success",
      message: "created",
      createdService: { id: "dbgate-1", type: "compose" },
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
    await expect(response.json()).resolves.toMatchObject({
      services: [
        { id: "postgres-1", type: "postgres" },
        { id: "redis-1", type: "redis" },
        { id: "dbgate-1", type: "compose" },
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
});
