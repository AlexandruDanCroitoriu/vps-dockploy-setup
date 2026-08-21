import { describe, expect, it } from "vitest";

import { normalizeAdminPasswordHash } from "./auth";

describe("administrator credentials", () => {
  it("accepts raw and environment-file escaped bcrypt hashes", () => {
    const raw = "$2b$12$example";

    expect(normalizeAdminPasswordHash(raw)).toBe(raw);
    expect(normalizeAdminPasswordHash("\\$2b\\$12\\$example")).toBe(raw);
  });
});
