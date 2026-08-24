import { describe, expect, it } from "vitest";
import { createdApiKey, firstOrganizationId } from "./bootstrap-dokploy";

describe("Dokploy API-key response handling", () => {
  it("gets the administrator's first organization ID", () => {
    expect(firstOrganizationId([{ id: "organization-1" }])).toBe(
      "organization-1",
    );
  });

  it("accepts organizationId response variants", () => {
    expect(firstOrganizationId([{ organizationId: "organization-2" }])).toBe(
      "organization-2",
    );
  });

  it("extracts the key returned by user.createApiKey", () => {
    expect(createdApiKey({ id: "key-1", key: "actual-secret-key" })).toBe(
      "actual-secret-key",
    );
  });

  it("rejects the legacy user.generateToken stub response", () => {
    expect(createdApiKey("token")).toBe("");
  });
});
