import { describe, expect, it } from "vitest";

import { credentialValuesMatch } from "./auth";

describe("shared service credentials", () => {
  it("compares credential values", () => {
    expect(
      credentialValuesMatch("admin@example.com", "admin@example.com"),
    ).toBe(true);
    expect(credentialValuesMatch("wrong", "admin@example.com")).toBe(false);
  });
});
