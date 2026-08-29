import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  resolveInfraManagementHostname,
  serializeInfraManagementEnvironment,
} from "./infra-management-environment";

describe("Infra Management deployment environment", () => {
  it("uses the root domain by default and prefixes an optional subdomain", () => {
    expect(resolveInfraManagementHostname("", "Example.COM")).toBe(
      "example.com",
    );
    expect(resolveInfraManagementHostname(" admin ", "example.com")).toBe(
      "admin.example.com",
    );
  });

  it("includes source dashboard provider keys with safe quoting", () => {
    expect(
      serializeInfraManagementEnvironment({
        username: "admin@example.com",
        password: "password",
        authSecret: "auth-secret",
        nextAuthUrl: "https://infra.example.com",
        cloudflareApiToken: "placeholder-token/with-special-characters",
        resendApiKey: "re_management-key",
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
        resendApiKey: "re_management-key",
      }),
    ).toContain('PROJECT_BUILDS_ENABLED="true"');
    expect(
      serializeInfraManagementEnvironment({
        username: "admin@example.com",
        password: "password",
        authSecret: "auth-secret",
        nextAuthUrl: "https://infra.example.com",
        cloudflareApiToken: "token",
        resendApiKey: "re_management-key",
      }),
    ).toContain('RESEND_API_KEY="re_management-key"');
  });
});
