import { beforeEach, describe, expect, it, vi } from "vitest";
import { dokployProvisioningJob } from "@/tests/fixtures/dokploy";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/dokploy/bootstrap-zot", () => ({
  deployDokployZotRegistry: vi.fn(),
  ensureDokployMainProject: vi.fn(),
  inspectDokployBootstrapResources: vi.fn(),
}));
vi.mock("@/lib/storage/dokploy-instances", () => ({
  updateDokployInstance: vi.fn(),
}));
vi.mock("@/lib/dokploy/sidebar-project-snapshot", () => ({
  refreshSidebarProjectSnapshot: vi.fn(),
}));
vi.mock("@/lib/dokploy/r2-destinations", () => ({
  syncAllR2BucketsToDokployInstance: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
import { inspectDokployBootstrapResources } from "@/lib/dokploy/bootstrap-zot";
import {
  beginDokployProvisioningStep,
  completeDokployProvisioningStep,
  getDokployProvisioningJob,
  updateDokployProvisioningJob,
} from "@/lib/storage/dokploy-provisioning";
import { runDokployBootstrapStep } from "@/lib/vps/bootstrap-dokploy";
import { refreshSidebarProjectSnapshot } from "@/lib/dokploy/sidebar-project-snapshot";
import { revalidatePath } from "next/cache";
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
  vi.mocked(refreshSidebarProjectSnapshot).mockResolvedValue({
    projects: [
      {
        projectId: "main-1",
        name: "Main",
        description: "",
        env: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        environments: [],
      },
    ],
    updatedAt: Date.now(),
    refreshing: false,
    error: "",
  });
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
    expect(refreshSidebarProjectSnapshot).toHaveBeenCalledWith("instance-1");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("auto-completes existing Main and Zot steps after API key creation", async () => {
    const runningJob = dokployProvisioningJob({
      apiKey: "",
      steps: {
        updating: "done",
        installing: "done",
        administrator: "done",
        domain: "done",
        "api-key": "running",
      },
      status: "running",
    });
    const keyedJob = dokployProvisioningJob({
      apiKey: "generated-key",
      steps: { ...runningJob.steps, "api-key": "done" },
      status: "running",
    });
    vi.mocked(beginDokployProvisioningStep).mockReturnValue({
      status: "started",
      job: runningJob,
    });
    vi.mocked(runDokployBootstrapStep).mockImplementation(
      async (_input, _progress, _log, onApiKey) => {
        await onApiKey?.("generated-key");
        return {
          apiKey: "generated-key",
          rootUrl: "https://dockploy.example.com",
          setupUrl: "http://203.0.113.10:3000",
        };
      },
    );
    vi.mocked(getDokployProvisioningJob).mockReturnValue(keyedJob);
    vi.mocked(inspectDokployBootstrapResources).mockResolvedValue({
      mainProjectExists: true,
      zotExists: true,
    });
    vi.mocked(completeDokployProvisioningStep).mockReturnValue(
      dokployProvisioningJob({ status: "complete" }),
    );

    expect((await POST(request("api-key"))).status).toBe(200);
    expect(inspectDokployBootstrapResources).toHaveBeenCalledWith({
      baseUrl: "http://203.0.113.10:3000",
      apiKey: "generated-key",
    });
    expect(updateDokployProvisioningJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ step: "main-project", stepStatus: "done" }),
    );
    expect(updateDokployProvisioningJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ step: "zot", stepStatus: "done" }),
    );
  });
});
