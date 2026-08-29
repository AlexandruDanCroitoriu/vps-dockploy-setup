import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ getResendDomain: vi.fn() }));

import { getResendDomain } from "./client";
import { waitForResendDomainVerification } from "./provisioning";

const domain = (status: string) => ({
  id: "domain-1",
  name: "example.com",
  status,
  records: [],
});

describe("Resend domain verification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("waits until Resend reports the domain as verified", async () => {
    vi.mocked(getResendDomain)
      .mockResolvedValueOnce(domain("pending"))
      .mockResolvedValueOnce(domain("verified"));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      waitForResendDomainVerification("domain-1", {
        attempts: 2,
        intervalMs: 10,
        wait,
      }),
    ).resolves.toMatchObject({ status: "verified" });
    expect(wait).toHaveBeenCalledWith(10);
  });

  it("rejects provisioning while the domain remains unverified", async () => {
    vi.mocked(getResendDomain).mockResolvedValue(domain("pending"));

    await expect(
      waitForResendDomainVerification("domain-1", {
        attempts: 2,
        intervalMs: 0,
        wait: async () => undefined,
      }),
    ).rejects.toThrow("still pending DNS verification");
  });
});
