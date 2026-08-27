import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getImageJob, startImageJob } from "./image-jobs";

describe("image jobs", () => {
  it("tracks a job after the caller receives its running state", async () => {
    let finish!: (value: { status: "success"; message: string }) => void;
    const work = new Promise<{ status: "success"; message: string }>(
      (resolve) => {
        finish = resolve;
      },
    );

    expect(startImageJob("app", "build", () => work)).toMatchObject({
      status: "running",
      type: "build",
    });
    expect(getImageJob("app")?.status).toBe("running");

    finish({ status: "success", message: "Built app:latest." });
    await vi.waitFor(() => expect(getImageJob("app")?.status).toBe("success"));
  });

  it("does not start a second operation while one is running", () => {
    const run = vi.fn(() => new Promise<never>(() => {}));

    const first = startImageJob("other-app", "push", run);
    const second = startImageJob("other-app", "build", run);

    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
