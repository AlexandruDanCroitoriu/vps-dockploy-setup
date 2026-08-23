import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildZotEnvironment, zotService } from "./zot";

describe("Zot Compose definition", () => {
  it("runs the official Zot image with authenticated persistent storage and UI", () => {
    expect(zotService.name).toBe("Zot");
    expect(zotService.composeFile).toContain(
      "ghcr.io/project-zot/zot:v2.1.20",
    );
    expect(zotService.composeFile).toContain(
      "zot-data:/var/lib/registry",
    );
    expect(zotService.composeFile).toContain(
      '"htpasswd": { "path": "/etc/zot/htpasswd" }',
    );
    expect(zotService.composeFile).toContain('"ui": { "enable": true }');
    expect(zotService.composeFile).not.toContain("ZOT_USERNAME_JSON");
    expect(zotService.requiresLoginCredentials).toBe(true);
    expect(zotService.maxPerInstance).toBe(1);
    expect(zotService.domain).toMatchObject({
      serviceName: "zot",
      defaultSubdomain: "zot",
      port: 5000,
      generateByDefault: true,
      httpsByDefault: true,
    });
  });

  it("generates a bcrypt htpasswd entry without retaining the plaintext password", () => {
    const environment = buildZotEnvironment("operator", "registry-password");

    expect(environment).toContain('ZOT_HTPASSWD="operator:$2');
    expect(environment).not.toContain("registry-password");
    expect(environment).toMatch(/ZOT_SESSION_HASH_KEY="[a-f0-9]{64}"/);
    expect(environment).toMatch(/ZOT_SESSION_ENCRYPT_KEY="[a-f0-9]{32}"/);
  });

  it("renders a valid JSON configuration after Compose interpolation", () => {
    const environment = Object.fromEntries(
      buildZotEnvironment("operator", "registry-password")
        .split("\n")
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), JSON.parse(line.slice(separator + 1))];
        }),
    );
    const configBlock = zotService.composeFile
      .match(/zot-config:\n    content: \|\n([\s\S]*?)  zot-htpasswd:/)?.[1]
      ?.split("\n")
      .map((line) => line.replace(/^      /, ""))
      .join("\n");

    expect(configBlock).toBeTruthy();
    expect(() =>
      JSON.parse(
        configBlock!
          .replaceAll("${ZOT_SESSION_HASH_KEY}", environment.ZOT_SESSION_HASH_KEY)
          .replaceAll(
            "${ZOT_SESSION_ENCRYPT_KEY}",
            environment.ZOT_SESSION_ENCRYPT_KEY,
          ),
      ),
    ).not.toThrow();
  });

  it("rejects usernames that cannot be represented by htpasswd", () => {
    expect(() => buildZotEnvironment("invalid:user", "password")).toThrow(
      "cannot contain colons",
    );
  });
});
