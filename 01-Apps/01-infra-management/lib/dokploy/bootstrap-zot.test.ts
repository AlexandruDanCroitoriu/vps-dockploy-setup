import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({
  dokployGetWithConfiguration: vi.fn(),
  dokployPostWithConfiguration: vi.fn(),
}));

import {
  dokployGetWithConfiguration,
  dokployPostWithConfiguration,
} from "./client";
import {
  deployDokployZotRegistry,
  ensureDokployMainProject,
  inspectDokployBootstrapResources,
} from "./bootstrap-zot";

const configuration = {
  baseUrl: "https://dockploy.example.com",
  apiKey: "api-key",
};

beforeEach(() => {
  vi.mocked(dokployGetWithConfiguration).mockReset();
  vi.mocked(dokployPostWithConfiguration).mockReset();
});

describe("Zot instance bootstrap", () => {
  it("detects an existing Main project and Zot service", async () => {
    const project = {
      projectId: "project-main",
      name: "Main",
      environments: [
        {
          environmentId: "production",
          name: "Production",
          compose: [{ composeId: "compose-zot", name: "Zot" }],
        },
      ],
    };
    vi.mocked(dokployGetWithConfiguration)
      .mockResolvedValueOnce([project])
      .mockResolvedValueOnce(project);

    await expect(
      inspectDokployBootstrapResources(configuration),
    ).resolves.toEqual({ mainProjectExists: true, zotExists: true });
    expect(dokployPostWithConfiguration).not.toHaveBeenCalled();
  });

  it("creates main and deploys Zot when the instance has no Zot service", async () => {
    const mainProject = {
      projectId: "project-main",
      name: "main",
      environments: [
        {
          environmentId: "environment-production",
          name: "Production",
          compose: [],
        },
      ],
    };
    vi.mocked(dokployGetWithConfiguration)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mainProject])
      .mockResolvedValueOnce(mainProject)
      .mockResolvedValueOnce({
        composeId: "compose-zot",
        composeStatus: "done",
      });
    vi.mocked(dokployPostWithConfiguration)
      .mockResolvedValueOnce({
        project: { projectId: "project-main" },
        environment: { environmentId: "environment-production" },
      })
      .mockResolvedValueOnce({ composeId: "compose-zot" })
      .mockResolvedValue(undefined);

    await expect(ensureDokployMainProject(configuration)).resolves.toEqual({
      created: true,
      projectId: "project-main",
    });
    await expect(
      deployDokployZotRegistry({
        configuration,
        rootDomain: "example.com",
        username: "admin@example.com",
        password: "registry-password",
      }),
    ).resolves.toMatchObject({
      created: true,
      projectId: "project-main",
      composeId: "compose-zot",
    });

    expect(dokployPostWithConfiguration).toHaveBeenCalledWith(
      configuration,
      "project.create",
      { name: "main" },
    );
    expect(dokployPostWithConfiguration).toHaveBeenCalledWith(
      configuration,
      "domain.create",
      {
        host: "zot.example.com",
        port: 5000,
        https: true,
        certificateType: "letsencrypt",
        domainType: "compose",
        composeId: "compose-zot",
        serviceName: "zot",
      },
    );
    expect(dokployPostWithConfiguration).toHaveBeenLastCalledWith(
      configuration,
      "compose.deploy",
      { composeId: "compose-zot" },
    );
  });

  it("reuses main and does not deploy when Zot already exists", async () => {
    const project = {
      projectId: "another-project",
      name: "Main",
      environments: [
        {
          environmentId: "production",
          name: "Production",
          compose: [{ composeId: "existing-zot", name: "Zot" }],
        },
      ],
    };
    vi.mocked(dokployGetWithConfiguration)
      .mockResolvedValueOnce([project])
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce([project])
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce({
        composeId: "existing-zot",
        composeStatus: "done",
      });

    await expect(ensureDokployMainProject(configuration)).resolves.toEqual({
      created: false,
      projectId: "another-project",
    });
    await expect(
      deployDokployZotRegistry({
        configuration,
        rootDomain: "example.com",
        username: "admin@example.com",
        password: "registry-password",
      }),
    ).resolves.toEqual({ created: false });
    expect(dokployPostWithConfiguration).not.toHaveBeenCalled();
  });
});
