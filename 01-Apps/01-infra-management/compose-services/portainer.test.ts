import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildPortainerEnvironment, portainerService } from "./portainer";

describe("Portainer Compose definition", () => {
  it("matches the official Dokploy Portainer blueprint", () => {
    expect(portainerService.name).toBe("Portainer");
    expect(portainerService.composeFile).toContain(
      "portainer/portainer-ce:latest",
    );
    expect(portainerService.composeFile).toContain(
      "/var/run/docker.sock:/var/run/docker.sock",
    );
    expect(portainerService.composeFile).toContain("portainer-data:/data");
    expect(portainerService.composeFile).toContain('expose:\n      - "9000"');
    expect(portainerService.domain).toMatchObject({
      serviceName: "portainer",
      defaultSubdomain: "portainer",
      port: 9000,
      generateByDefault: true,
      httpsByDefault: true,
    });
    expect(portainerService.requiresLoginCredentials).toBe(true);
    expect(portainerService.composeFile).toContain("/api/users/admin/init");
    expect(portainerService.composeFile).toContain('"--setup-token"');
    expect(portainerService.composeFile).toContain('"X-Setup-Token"');
    expect(portainerService.composeFile).toContain(
      "portainer-init:\n    image: python:3.13-alpine\n    restart: unless-stopped",
    );
    expect(portainerService.composeFile).toContain(
      "while True:\n            time.sleep(86400)",
    );
  });

  it("passes the configured initial administrator credentials to the initializer", () => {
    expect(
      buildPortainerEnvironment("operator", "login-secret", "setup-secret"),
    ).toBe(
      'PORTAINER_ADMIN_USERNAME="operator"\nPORTAINER_ADMIN_PASSWORD="login-secret"\nPORTAINER_SETUP_TOKEN="setup-secret"',
    );
  });
});
