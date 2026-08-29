import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createResendDomain,
  listResendDomains,
  ResendConfigurationError,
  verifyResendDomain,
} from "./domains";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
});

describe("Resend domains", () => {
  it("requires the server-side API key", async () => {
    await expect(listResendDomains()).rejects.toBeInstanceOf(
      ResendConfigurationError,
    );
  });

  it("creates a sending-only domain with the environment key", async () => {
    process.env.RESEND_API_KEY = "test-management-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "domain-1",
          name: "Example.COM",
          status: "not_started",
          records: [
            {
              record: "SPF",
              name: "send",
              type: "MX",
              value: "feedback-smtp.example.com",
              priority: 10,
              status: "not_started",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createResendDomain("example.com")).resolves.toMatchObject({
      id: "domain-1",
      name: "example.com",
      records: [{ type: "MX", priority: 10 }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/domains",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "example.com",
          sending: "enabled",
          receiving: "disabled",
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer test-management-key",
        }),
      }),
    );
  });

  it("requests verification for the selected domain", async () => {
    process.env.RESEND_API_KEY = "test-management-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await verifyResendDomain("domain/1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/domains/domain%2F1/verify",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
