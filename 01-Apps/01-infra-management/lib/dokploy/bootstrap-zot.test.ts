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
import { ensureDokployZotRegistry } from "./bootstrap-zot";

const configuration = {
  baseUrl: "https://dockploy.example.com",
  apiKey: "api-key",
};

beforeEach(() => {
  vi.mocked(dokployGetWithConfiguration).mockReset();
  vi.mocked(dokployPostWithConfiguration).mockReset();
});

describe("Zot instance bootstrap", () => {
  it("creates main and deploys Zot when the instance has no Zot service", async () => {
    vi.mocked(dokployGetWithConfiguration).mockResolvedValueOnce([]);
    vi.mocked(dokployPostWithConfiguration)
      .mockResolvedValueOnce({
        project: { projectId: "project-main" },
        environment: { environmentId: "environment-production" },
      })
      .mockResolvedValueOnce({ composeId: "compose-zot" })
      .mockResolvedValue(undefined);

    await expect(
      ensureDokployZotRegistry({
        configuration,
        rootDomain: "example.com",
        username: "admin@example.com",
        password: "registry-password",
      }),
    ).resolves.toMatchObject({
      created: true,
      projectCreated: true,
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

  it("does not create main when Zot exists in any project", async () => {
    const project = {
      projectId: "another-project",
      name: "Applications",
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
      .mockResolvedValueOnce(project);

    await expect(
      ensureDokployZotRegistry({
        configuration,
        rootDomain: "example.com",
        username: "admin@example.com",
        password: "registry-password",
      }),
    ).resolves.toEqual({ created: false });
    expect(dokployPostWithConfiguration).not.toHaveBeenCalled();
  });
});
