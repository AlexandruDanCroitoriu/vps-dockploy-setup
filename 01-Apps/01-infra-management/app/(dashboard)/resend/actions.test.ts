import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/cloudflare/zones", () => ({
  createCloudflareDnsRecord: vi.fn(),
  getCloudflareZones: vi.fn(),
  invalidateCloudflareZones: vi.fn(),
}));
vi.mock("@/lib/dokploy", () => ({
  deployDokployServiceWithConfiguration: vi.fn(),
  getDokployProjectsWithConfiguration: vi.fn(),
  mergeDokployProjectEnv: (current: string, entries: Record<string, string>) =>
    `${current}\n${Object.entries(entries)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n")}`,
  parseDokployEnvironmentEntries: vi.fn(() => ({})),
  updateDokployProjectEnvWithConfiguration: vi.fn(),
  updateDokployServiceEnvWithConfiguration: vi.fn(),
}));
vi.mock("@/lib/resend/client", () => ({
  createResendSendingKey: vi.fn(),
}));
vi.mock("@/lib/resend/domains", () => ({
  createResendDomain: vi.fn(),
  getResendDomain: vi.fn(),
  listResendDomains: vi.fn(),
  verifyResendDomain: vi.fn(),
}));
vi.mock("@/lib/storage/dokploy-instances", () => ({
  getDokployInstance: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { getCloudflareZones } from "@/lib/cloudflare/zones";
import {
  deployDokployServiceWithConfiguration,
  getDokployProjectsWithConfiguration,
  updateDokployServiceEnvWithConfiguration,
} from "@/lib/dokploy";
import { createResendSendingKey } from "@/lib/resend/client";
import {
  createResendDomain,
  listResendDomains,
  verifyResendDomain,
} from "@/lib/resend/domains";
import { getDokployInstance } from "@/lib/storage/dokploy-instances";
import { configureResendDomainAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "admin" } });
  vi.mocked(getDokployInstance).mockReturnValue({
    id: "instance-1",
    name: "Production",
    rootUrl: "https://dockploy.example.com",
    rootDomain: "example.com",
    vpsIp: "",
    vpsPassword: "",
    apiKey: "dockploy-key",
    defaultServiceUsername: "admin@example.com",
    defaultServicePassword: "password",
  });
  vi.mocked(getCloudflareZones).mockResolvedValue([
    {
      id: "zone-1",
      name: "example.com",
      status: "active",
      paused: false,
      ipAddress: "192.0.2.1",
      subdomains: [],
    },
  ]);
  vi.mocked(listResendDomains).mockResolvedValue([]);
  vi.mocked(createResendDomain).mockResolvedValue({
    id: "domain-1",
    name: "example.com",
    status: "pending",
    region: "eu-west-1",
    records: [],
  });
  vi.mocked(createResendSendingKey).mockResolvedValue("restricted-sending-key");
  vi.mocked(getDokployProjectsWithConfiguration).mockResolvedValue([
    {
      projectId: "project-1",
      name: "Store",
      description: null,
      createdAt: "2026-08-28T00:00:00.000Z",
      env: "DATABASE_HOST=postgres",
      environments: [
        {
          environmentId: "environment-1",
          name: "production",
          services: [
            {
              id: "application-1",
              name: "vendure",
              appName: "vendure",
              env: "DATABASE_HOST=postgres",
              serverId: null,
              sourcePath: "/01-Apps/02-Online-Store-Vendure/apps/server",
              type: "applications",
              status: "running",
              credentials: [],
            },
            {
              id: "application-2",
              name: "vendure-storefront-clean",
              appName: "vendure-storefront-clean",
              env: "",
              serverId: null,
              sourcePath:
                "/01-Apps/02-Online-Store-Vendure/apps/storefront-clean",
              type: "applications",
              status: "running",
              credentials: [],
            },
          ],
        },
      ],
    },
  ]);
});

describe("configureResendDomainAction", () => {
  it("configures the instance Vendure backend with restricted SMTP credentials", async () => {
    const result = await configureResendDomainAction("instance-1");

    expect(createResendSendingKey).toHaveBeenCalledWith({
      name: "Vendure example.com",
      domainId: "domain-1",
    });
    expect(updateDokployServiceEnvWithConfiguration).toHaveBeenCalledWith(
      {
        baseUrl: "https://dockploy.example.com",
        apiKey: "dockploy-key",
      },
      "applications",
      "application-1",
      expect.stringContaining('MAIL_FROM_ADDRESS="account@example.com"'),
    );
    expect(updateDokployServiceEnvWithConfiguration).toHaveBeenCalledWith(
      expect.anything(),
      "applications",
      "application-1",
      expect.stringContaining('SMTP_PASSWORD="restricted-sending-key"'),
    );
    expect(updateDokployServiceEnvWithConfiguration).toHaveBeenCalledWith(
      expect.anything(),
      "applications",
      "application-1",
      expect.stringContaining(
        'VENDURE_STOREFRONT_URL="https://storefront-clean.example.com"',
      ),
    );
    expect(deployDokployServiceWithConfiguration).toHaveBeenCalledWith(
      expect.anything(),
      "applications",
      "application-1",
    );
    expect(verifyResendDomain).toHaveBeenCalledWith("domain-1");
    expect(result).toEqual({
      status: "success",
      message:
        "DNS configured and 1 Vendure backend updated for account@example.com.",
    });
  });
});
