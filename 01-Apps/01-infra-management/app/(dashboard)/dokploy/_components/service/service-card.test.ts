import { describe, expect, it } from "vitest";

import type { DokployDomain, DokployService } from "@/lib/dokploy";
import { getServiceDomainHref } from "./service-card";

const domain: DokployDomain = {
  domainId: "domain-1",
  host: "vendure.example.com",
  port: 3000,
  https: true,
  letsEncrypt: true,
  serviceName: "vendure",
  enabled: true,
};

function application(overrides: Partial<DokployService> = {}): DokployService {
  return {
    id: "service-1",
    name: "application",
    appName: null,
    env: "",
    serverId: null,
    sourcePath: null,
    type: "applications",
    status: "running",
    credentials: [],
    ...overrides,
  };
}

describe("getServiceDomainHref", () => {
  it("opens a Vendure application at its dashboard path", () => {
    expect(
      getServiceDomainHref(application({ name: "vendure" }), domain),
    ).toBe("https://vendure.example.com/dashboard");
  });

  it("recognizes the Vendure backend source path", () => {
    expect(
      getServiceDomainHref(
        application({
          sourcePath: "/01-Apps/02-Online-Store-Vendure/apps/server",
        }),
        domain,
      ),
    ).toBe("https://vendure.example.com/dashboard");
  });

  it("leaves other service domain links unchanged", () => {
    expect(getServiceDomainHref(application(), domain)).toBe(
      "https://vendure.example.com",
    );
  });
});
