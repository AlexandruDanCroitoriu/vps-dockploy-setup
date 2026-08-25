import type { DokployProvisioningJob } from "@/lib/storage/dokploy-provisioning";

export function dokployProvisioningJob(
  overrides: Partial<DokployProvisioningJob> = {},
): DokployProvisioningJob {
  return {
    id: "job-1",
    instanceId: "instance-1",
    name: "Production",
    rootUrl: "https://dockploy.example.com",
    rootDomain: "example.com",
    vpsIp: "203.0.113.10",
    defaultServiceUsername: "admin@example.com",
    defaultServicePassword: "password",
    apiKey: "api-key",
    status: "waiting",
    steps: {},
    logs: {},
    error: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
