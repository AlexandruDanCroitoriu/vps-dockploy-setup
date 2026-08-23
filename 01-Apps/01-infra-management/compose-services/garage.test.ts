import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildGarageEnvironment, garageService } from "./garage";

describe("Garage Compose definition", () => {
  it("runs Garage and its WebUI with persistent storage", () => {
    expect(garageService.name).toBe("Garage with UI");
    expect(garageService.composeFile).toContain("dxflrs/garage:v2.3.0");
    expect(garageService.composeFile).not.toContain("command: server");
    expect(garageService.composeFile).toContain(
      "khairul169/garage-webui:1.1.0",
    );
    expect(garageService.composeFile).toContain(
      "garage-data:/var/lib/garage/data",
    );
    expect(garageService.composeFile).toContain(
      'admin_token = "${GARAGE_ADMIN_TOKEN}"',
    );
    expect(
      garageService.composeFile.match(/target: \/etc\/garage\.toml/g),
    ).toHaveLength(2);
    expect(garageService.composeFile).toContain("replication_factor = 1");
    expect(garageService.domain).toMatchObject({
      serviceName: "garage-webui",
      port: 3909,
      generateByDefault: true,
      httpsByDefault: true,
    });
  });

  it("generates Garage secrets and hashes the WebUI password", () => {
    const environment = buildGarageEnvironment(
      "webui-password",
      "operator",
      25,
    );

    expect(environment).toMatch(/GARAGE_RPC_SECRET="[a-f0-9]{64}"/);
    expect(environment).toMatch(/GARAGE_ADMIN_TOKEN="[a-f0-9]{64}"/);
    expect(environment).toMatch(/GARAGE_METRICS_TOKEN="[a-f0-9]{64}"/);
    expect(environment).toContain('GARAGE_WEBUI_AUTH="operator:$2');
    expect(environment).not.toContain("webui-password");
    expect(environment).toContain('GARAGE_CAPACITY_BYTES="25000000000"');
    expect(garageService.composeFile).toContain("/v2/UpdateClusterLayout");
    expect(garageService.composeFile).toContain("/v2/ApplyClusterLayout");
    expect(garageService.composeFile).toContain(
      'status.get("nodes", []) if item.get("isUp")',
    );
    expect(garageService.composeFile).not.toContain('status["node"]');
    expect(garageService.composeFile).toContain(
      'entrypoint: ["python"]\n    command:\n      - "-c"',
    );
  });
});
