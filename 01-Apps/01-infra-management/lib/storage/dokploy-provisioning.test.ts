import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "./database";
import {
  startDokployProvisioningJob,
  updateDokployProvisioningJob,
} from "./dokploy-provisioning";

let temporaryDirectory = "";

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "infra-job-"));
  process.env.SQLITE_DATABASE_PATH = path.join(temporaryDirectory, "test.sqlite");
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
  vpsPassword: "password",
  defaultServiceUsername: "admin@example.com",
  defaultServicePassword: "password",
};

describe("Dokploy provisioning persistence", () => {
  it("starts interrupted setups again with no steps, logs, errors, or API key", () => {
    const first = startDokployProvisioningJob(input);
    updateDokployProvisioningJob(first.id, {
      step: "updating",
      stepStatus: "done",
      log: { step: "updating", message: "Update completed." },
    });
    updateDokployProvisioningJob(first.id, {
      step: "starting",
      stepStatus: "error",
      log: { step: "starting", message: "Obsolete failure." },
      error: "Obsolete failure.",
    });

    const retry = startDokployProvisioningJob(input);

    expect(retry.steps).toEqual({});
    expect(retry.logs).toEqual({});
    expect(retry.error).toBe("");
    expect(retry.apiKey).toBe("");
  });
});
