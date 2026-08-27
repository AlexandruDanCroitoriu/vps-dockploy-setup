import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { serializeInfraManagementEnvironment } from "./infra-management-environment";

describe("Infra Management deployment environment", () => {
  it("includes the source dashboard Cloudflare token with safe quoting", () => {
    expect(
      serializeInfraManagementEnvironment({
        username: "admin@example.com",
        password: "password",
        authSecret: "auth-secret",
        nextAuthUrl: "https://infra.example.com",
        cloudflareApiToken: "placeholder-token/with-special-characters",
      }),
    ).toContain(
      'CLOUDFLARE_API_TOKEN="placeholder-token/with-special-characters"',
    );
    expect(
      serializeInfraManagementEnvironment({
        username: "admin@example.com",
        password: "password",
        authSecret: "auth-secret",
        nextAuthUrl: "https://infra.example.com",
        cloudflareApiToken: "token",
      }),
    ).toContain('PROJECT_BUILDS_ENABLED="true"');
  });
});
