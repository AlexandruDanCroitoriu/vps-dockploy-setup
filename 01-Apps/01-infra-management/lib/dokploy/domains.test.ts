import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ dokployGet: vi.fn(), dokployPost: vi.fn() }));

import { dokployGet, dokployPost } from "./client";
import { getDokployDomainServerIp, validateDokployDomain } from "./domains";

describe("domain validation", () => {
  beforeEach(() => {
    vi.mocked(dokployGet).mockReset();
    vi.mocked(dokployPost).mockReset();
  });

  it("skips the remote-server lookup for Dokploy's default server", async () => {
    await expect(getDokployDomainServerIp(null)).resolves.toBe("");
    expect(dokployGet).not.toHaveBeenCalled();
  });

  it("loads the IP for an explicitly assigned remote server", async () => {
    vi.mocked(dokployGet).mockResolvedValueOnce("203.0.113.10");

    await expect(getDokployDomainServerIp("server-1")).resolves.toBe(
      "203.0.113.10",
    );
    expect(dokployGet).toHaveBeenCalledWith(
      "domain.canGenerateTraefikMeDomains?serverId=server-1",
    );
  });

  it("omits an unavailable server IP from the validation payload", async () => {
    vi.mocked(dokployPost).mockResolvedValueOnce({
      isValid: true,
      resolvedIp: "203.0.113.10",
    });

    await expect(
      validateDokployDomain("db.example.com", ""),
    ).resolves.toMatchObject({ isValid: true });
    expect(dokployPost).toHaveBeenCalledWith("domain.validateDomain", {
      domain: "db.example.com",
    });
  });
});
