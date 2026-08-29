import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ dokployGet: vi.fn(), dokployPost: vi.fn() }));

import { dokployGet, dokployPost } from "./client";
import { createDokployRawCompose, getDokployRawComposeFile } from "./composes";

describe("raw Compose services", () => {
  beforeEach(() => {
    vi.mocked(dokployPost).mockReset();
    vi.mocked(dokployGet).mockReset();
  });

  it("loads the Compose document only for raw Compose services", async () => {
    vi.mocked(dokployGet)
      .mockResolvedValueOnce({
        composeId: "compose-raw",
        sourceType: "raw",
        composeFile: "services:\n  web:\n    image: nginx:alpine",
      })
      .mockResolvedValueOnce({
        composeId: "compose-git",
        sourceType: "github",
        composeFile: "services: {}",
      });

    await expect(getDokployRawComposeFile("compose-raw")).resolves.toBe(
      "services:\n  web:\n    image: nginx:alpine",
    );
    await expect(getDokployRawComposeFile("compose-git")).resolves.toBeNull();
    expect(dokployGet).toHaveBeenNthCalledWith(
      1,
      "compose.one?composeId=compose-raw",
    );
  });

  it("creates a Docker Compose service with a raw source", async () => {
    vi.mocked(dokployPost)
      .mockResolvedValueOnce({ composeId: "compose-1" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await createDokployRawCompose({
      name: "web-stack",
      environmentId: "environment-1",
      composeFile: "services:\n  web:\n    image: nginx:alpine",
      environmentVariables: "APP_ENV=production",
    });

    expect(dokployPost).toHaveBeenCalledWith("compose.create", {
      name: "web-stack",
      environmentId: "environment-1",
      composeType: "docker-compose",
      sourceType: "raw",
      composeFile: "services:\n  web:\n    image: nginx:alpine",
    });
    expect(dokployPost).toHaveBeenCalledWith("compose.update", {
      composeId: "compose-1",
      sourceType: "raw",
      composeType: "docker-compose",
      composeFile: "services:\n  web:\n    image: nginx:alpine",
    });
    expect(dokployPost).toHaveBeenCalledWith("compose.saveEnvironment", {
      composeId: "compose-1",
      env: "APP_ENV=production",
    });
  });

  it("does not save an empty environment document", async () => {
    vi.mocked(dokployPost).mockResolvedValueOnce({
      data: { composeId: "compose-2" },
    });

    await createDokployRawCompose({
      name: "web-stack",
      environmentId: "environment-1",
      composeFile: "services: {}",
      environmentVariables: "",
    });

    expect(dokployPost).toHaveBeenCalledTimes(2);
    expect(dokployPost).toHaveBeenLastCalledWith("compose.update", {
      composeId: "compose-2",
      sourceType: "raw",
      composeType: "docker-compose",
      composeFile: "services: {}",
    });
  });

  it("creates an optional domain for the configured Compose service", async () => {
    vi.mocked(dokployPost)
      .mockResolvedValueOnce({ composeId: "compose-3" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await createDokployRawCompose({
      name: "DBGate",
      environmentId: "environment-1",
      composeFile: "services:\n  dbgate:\n    image: dbgate/dbgate:latest",
      environmentVariables: "",
      domain: {
        host: "dbgate.example.com",
        serviceName: "dbgate",
        port: 3000,
        https: true,
      },
    });

    expect(dokployPost).toHaveBeenLastCalledWith("domain.create", {
      host: "dbgate.example.com",
      port: 3000,
      https: true,
      certificateType: "letsencrypt",
      domainType: "compose",
      composeId: "compose-3",
      serviceName: "dbgate",
    });
  });

  it("creates additional domains for services in the Compose stack", async () => {
    vi.mocked(dokployPost)
      .mockResolvedValueOnce({ composeId: "compose-garage" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await createDokployRawCompose({
      name: "Garage with UI",
      environmentId: "environment-1",
      composeFile: "services:\n  garage:\n    image: dxflrs/garage:v2.3.0",
      environmentVariables: "",
      additionalDomains: [
        {
          host: "s3.example.com",
          serviceName: "garage",
          port: 3900,
          https: true,
        },
      ],
    });

    expect(dokployPost).toHaveBeenLastCalledWith("domain.create", {
      host: "s3.example.com",
      port: 3900,
      https: true,
      certificateType: "letsencrypt",
      domainType: "compose",
      composeId: "compose-garage",
      serviceName: "garage",
    });
  });

  it("generates and creates a domain for a new Compose service", async () => {
    vi.mocked(dokployPost)
      .mockResolvedValueOnce({
        composeId: "compose-4",
        appName: "compose-dbgate-abc123",
        serverId: "server-1",
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("dbgate-generated.example.com")
      .mockResolvedValueOnce(undefined);

    await createDokployRawCompose({
      name: "DBGate",
      environmentId: "environment-1",
      composeFile: "services:\n  dbgate:\n    image: dbgate/dbgate:latest",
      environmentVariables: "",
      domain: {
        generate: true,
        serviceName: "dbgate",
        port: 3000,
        https: true,
      },
    });

    expect(dokployGet).not.toHaveBeenCalled();
    expect(dokployPost).toHaveBeenNthCalledWith(3, "domain.generateDomain", {
      appName: "compose-dbgate-abc123",
      serverId: "server-1",
    });
    expect(dokployPost).toHaveBeenLastCalledWith(
      "domain.create",
      expect.objectContaining({
        host: "dbgate-generated.example.com",
        composeId: "compose-4",
        serviceName: "dbgate",
      }),
    );
  });
});
