import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "./database";
import {
  createDokployInstance,
  deleteDokployInstance,
  getDokployUrlFromRootDomain,
  getDokployInstance,
  listDokployInstances,
  normalizeDokployUrl,
  normalizeRootDomain,
  updateDokployInstance,
} from "./dokploy-instances";

let temporaryDirectory = "";

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "infra-db-"));
  process.env.SQLITE_DATABASE_PATH = path.join(
    temporaryDirectory,
    "test.sqlite",
  );
});

afterEach(() => {
  closeDatabaseForTests();
  delete process.env.SQLITE_DATABASE_PATH;
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("Dockploy instance storage", () => {
  it("creates private database and directory permissions", () => {
    listDokployInstances();
    const databasePath = process.env.SQLITE_DATABASE_PATH!;
    expect(fs.statSync(databasePath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(databasePath)).mode & 0o777).toBe(0o700);
  });

  it("creates the schema and returns safe summaries", () => {
    const created = createDokployInstance({
      name: "Production",
      rootUrl: "https://dokploy.example.com",
      rootDomain: "example.com",
      vpsIp: "203.0.113.10",
      vpsPassword: "root-password",
      apiKey: "secret-key",
      defaultServiceUsername: "service-admin",
      defaultServicePassword: "service-password",
    });

    expect(listDokployInstances()).toEqual([created]);
    expect(created.rootDomain).toBe("example.com");
    expect(listDokployInstances()[0]).not.toHaveProperty("apiKey");
    expect(getDokployInstance(created.id)?.apiKey).toBe("secret-key");
    expect(getDokployInstance(created.id)).toMatchObject({
      vpsIp: "203.0.113.10",
      vpsPassword: "root-password",
      defaultServiceUsername: "service-admin",
      defaultServicePassword: "service-password",
    });
  });

  it("updates an instance without exposing its key in the result", () => {
    const created = createDokployInstance({
      name: "Production",
      rootUrl: "https://dokploy.example.com",
      rootDomain: "example.com",
      vpsIp: "203.0.113.10",
      vpsPassword: "old-root-password",
      apiKey: "old-key",
      defaultServiceUsername: "old-user",
      defaultServicePassword: "old-password",
    });

    expect(
      updateDokployInstance(created.id, {
        name: "Primary",
        rootUrl: "https://dockploy.primary.example.com",
        rootDomain: "primary.example.com",
        vpsIp: "203.0.113.20",
        vpsPassword: "new-root-password",
        apiKey: "new-key",
        defaultServiceUsername: "new-user",
        defaultServicePassword: "new-password",
      }),
    ).toEqual({
      id: created.id,
      name: "Primary",
      rootUrl: "https://dockploy.primary.example.com",
      rootDomain: "primary.example.com",
    });
    expect(getDokployInstance(created.id)?.apiKey).toBe("new-key");
    expect(getDokployInstance(created.id)).toMatchObject({
      vpsIp: "203.0.113.20",
      vpsPassword: "new-root-password",
      defaultServiceUsername: "new-user",
      defaultServicePassword: "new-password",
    });
  });

  it("deletes an instance", () => {
    const created = createDokployInstance({
      name: "Disposable",
      rootUrl: "https://dockploy.delete.example.com",
      rootDomain: "delete.example.com",
      apiKey: "secret-key",
      defaultServiceUsername: "admin",
      defaultServicePassword: "admin",
    });

    expect(deleteDokployInstance(created.id)).toBe(true);
    expect(getDokployInstance(created.id)).toBeNull();
    expect(deleteDokployInstance(created.id)).toBe(false);
  });
});

describe("root domain configuration", () => {
  it("normalizes the domain and builds the Dockploy URL", () => {
    expect(normalizeRootDomain(" Example.COM. ")).toBe("example.com");
    expect(getDokployUrlFromRootDomain("Example.com")).toBe(
      "https://dockploy.example.com",
    );
  });

  it.each([
    "https://example.com",
    "example.com/path",
    "example.com:3000",
    "single-label",
    "-invalid.example.com",
  ])("rejects a non-root-domain value: %s", (input) => {
    expect(() => normalizeRootDomain(input)).toThrow();
  });
});

describe("normalizeDokployUrl", () => {
  it.each([
    ["https://dokploy.example.com/", "https://dokploy.example.com"],
    ["https://dokploy.example.com/api", "https://dokploy.example.com"],
    ["http://localhost:3000/api/", "http://localhost:3000"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDokployUrl(input)).toBe(expected);
  });

  it.each([
    "ftp://dokploy.example.com",
    "https://user:pass@dokploy.example.com",
    "https://dokploy.example.com?unsafe=1",
    "https://dokploy.example.com#fragment",
  ])("rejects %s", (input) => {
    expect(() => normalizeDokployUrl(input)).toThrow();
  });
});
