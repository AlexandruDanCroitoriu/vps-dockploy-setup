import { beforeEach, describe, expect, it, vi } from "vitest";
import { dokployProvisioningJob } from "@/tests/fixtures/dokploy";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/dokploy/bootstrap-zot", () => ({
  deployDokployZotRegistry: vi.fn(),
  ensureDokployMainProject: vi.fn(),
}));
vi.mock("@/lib/storage/dokploy-instances", () => ({
  updateDokployInstance: vi.fn(),
}));
vi.mock("@/lib/vps/bootstrap-dokploy", () => ({
  runDokployBootstrapStep: vi.fn(),
}));
vi.mock("@/lib/storage/dokploy-provisioning", () => ({
  beginDokployProvisioningStep: vi.fn(),
  completeDokployProvisioningStep: vi.fn(),
  failDokployProvisioningStep: vi.fn(),
  getDokployProvisioningJob: vi.fn(),
  updateDokployProvisioningJob: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { ensureDokployMainProject } from "@/lib/dokploy/bootstrap-zot";
import {
  beginDokployProvisioningStep,
  completeDokployProvisioningStep,
  getDokployProvisioningJob,
} from "@/lib/storage/dokploy-provisioning";
import { POST } from "./route";

function request(step = "updating") {
  return new Request("http://localhost/api/dokploy-instances/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: "job-1", step }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "admin" } });
});

describe("provisioning step route", () => {
  it("requires authentication", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
  });

  it("rejects concurrent and out-of-order steps", async () => {
    vi.mocked(beginDokployProvisioningStep).mockReturnValueOnce({
      status: "busy",
    });
    expect((await POST(request())).status).toBe(409);
    vi.mocked(beginDokployProvisioningStep).mockReturnValueOnce({
      status: "out-of-order",
    });
    expect((await POST(request("zot"))).status).toBe(409);
  });

  it("completes an idempotent Main project step", async () => {
    const job = dokployProvisioningJob({
      steps: {
        updating: "done",
        installing: "done",
        administrator: "done",
        domain: "done",
        "api-key": "done",
        "main-project": "running",
      },
      status: "running",
    });
    vi.mocked(beginDokployProvisioningStep).mockReturnValue({
      status: "started",
      job,
    });
    vi.mocked(getDokployProvisioningJob).mockReturnValue(job);
    vi.mocked(ensureDokployMainProject).mockResolvedValue({
      created: true,
      projectId: "main-1",
    });
    vi.mocked(completeDokployProvisioningStep).mockReturnValue(
      dokployProvisioningJob({
        status: "waiting",
        steps: { ...job.steps, "main-project": "done" },
      }),
    );

    const response = await POST(request("main-project"));
    expect(response.status).toBe(200);
    expect(ensureDokployMainProject).toHaveBeenCalledWith({
      baseUrl: "http://203.0.113.10:3000",
      apiKey: "api-key",
    });
    expect(completeDokployProvisioningStep).toHaveBeenCalledWith(
      "job-1",
      "main-project",
    );
  });
});
