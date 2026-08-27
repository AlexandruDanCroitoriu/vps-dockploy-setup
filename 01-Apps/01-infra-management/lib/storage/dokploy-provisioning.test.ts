import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "./database";
import { DOKPLOY_BOOTSTRAP_STEPS } from "@/lib/vps/bootstrap-progress";
import {
  beginDokployProvisioningStep,
  completeDokployProvisioningStep,
  failDokployProvisioningStep,
  getDokployProvisioningJob,
  reconcileDokployResourceSteps,
  startDokployProvisioningJob,
  updateDokployProvisioningJob,
} from "./dokploy-provisioning";

let temporaryDirectory = "";

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "infra-job-"));
  process.env.SQLITE_DATABASE_PATH = path.join(
    temporaryDirectory,
    "test.sqlite",
  );
});

afterEach(() => {
  closeDatabaseForTests();
  delete process.env.SQLITE_DATABASE_PATH;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

const input = {
  name: "Production",
  rootUrl: "https://dockploy.example.com",
  rootDomain: "example.com",
  vpsIp: "203.0.113.10",
  defaultServiceUsername: "admin@example.com",
  defaultServicePassword: "password",
};

describe("Dokploy provisioning persistence", () => {
  it("enforces sequential and exclusive setup transitions", () => {
    const job = startDokployProvisioningJob(input);
    expect(beginDokployProvisioningStep(job.id, "updating").status).toBe(
      "started",
    );
    expect(beginDokployProvisioningStep(job.id, "updating").status).toBe(
      "busy",
    );
    completeDokployProvisioningStep(job.id, "updating");
    expect(beginDokployProvisioningStep(job.id, "installing").status).toBe(
      "started",
    );
    failDokployProvisioningStep(job.id, "installing", "SSH failed.");
    expect(getDokployProvisioningJob(job.id)).toMatchObject({
      status: "failed",
      error: "SSH failed.",
      steps: { updating: "done", installing: "error" },
    });
    expect(beginDokployProvisioningStep(job.id, "administrator").status).toBe(
      "out-of-order",
    );
    expect(beginDokployProvisioningStep(job.id, "installing").status).toBe(
      "started",
    );
  });

  it("keeps the combined API-key generation and verification step completed", () => {
    const job = startDokployProvisioningJob(input);
    updateDokployProvisioningJob(job.id, {
      step: "api-key",
      stepStatus: "done",
      apiKey: "generated-key",
      log: { step: "api-key", message: "Step completed." },
    });

    expect(getDokployProvisioningJob(job.id)?.steps["api-key"]).toBe("done");
    expect(getDokployProvisioningJob(job.id)?.apiKey).toBe("generated-key");
  });

  it("reopens completed resource steps when Main or Zot is missing", () => {
    const job = startDokployProvisioningJob(input);
    for (const step of DOKPLOY_BOOTSTRAP_STEPS) {
      updateDokployProvisioningJob(job.id, { step, stepStatus: "done" });
    }
    updateDokployProvisioningJob(job.id, { status: "complete" });

    expect(
      reconcileDokployResourceSteps(job.id, {
        mainProjectExists: false,
        zotExists: false,
      }),
    ).toMatchObject({
      status: "waiting",
      steps: {
        "api-key": "done",
      },
    });
    expect(getDokployProvisioningJob(job.id)?.steps["main-project"]).toBe(
      undefined,
    );
    expect(getDokployProvisioningJob(job.id)?.steps.zot).toBe(undefined);
  });

  it("starts interrupted setups again with no steps, logs, errors, or API key", () => {
    const first = startDokployProvisioningJob(input);
    updateDokployProvisioningJob(first.id, {
      step: "updating",
      stepStatus: "done",
      log: { step: "updating", message: "Update completed." },
    });
    updateDokployProvisioningJob(first.id, {
      step: "installing",
      stepStatus: "error",
      log: { step: "installing", message: "Obsolete failure." },
      error: "Obsolete failure.",
    });

    const retry = startDokployProvisioningJob(input);

    expect(retry.steps).toEqual({});
    expect(retry.logs).toEqual({});
    expect(retry.error).toBe("");
    expect(retry.apiKey).toBe("");
  });
});
