import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createResendSendingKey,
  ensureResendDomain,
  ResendConfigurationError,
} from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Resend management client", () => {
  it("requires the server-only management key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(ensureResendDomain("example.com")).rejects.toBeInstanceOf(
      ResendConfigurationError,
    );
  });

  it("creates a missing domain in the European sending region", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_management");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "domain-id",
            name: "example.com",
            status: "not_started",
            records: [],
          }),
          { status: 200 },
        ),
      );

    await expect(ensureResendDomain("Example.COM.")).resolves.toMatchObject({
      id: "domain-id",
      name: "example.com",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.resend.com/domains",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "example.com", region: "eu-west-1" }),
      }),
    );
  });

  it("creates a domain-scoped sending key", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_management");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ token: "re_sending" }), { status: 200 }),
    );

    await expect(
      createResendSendingKey({ name: "Vendure example.com", domainId: "domain-id" }),
    ).resolves.toBe("re_sending");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/api-keys",
      expect.objectContaining({
        body: JSON.stringify({
          name: "Vendure example.com",
          permission: "sending_access",
          domain_id: "domain-id",
        }),
      }),
    );
  });
});
