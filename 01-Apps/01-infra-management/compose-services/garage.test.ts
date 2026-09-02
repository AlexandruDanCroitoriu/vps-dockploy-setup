import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildGarageEnvironment, garageService } from "./garage";
import {
  resolveComposeProjectEnvironment,
  resolveComposeProjectEnvironmentKeys,
} from "./registry";

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
      {
        bucket: "vendure-assets",
        accessKeyId: "GKTEST",
        secretAccessKey: "s3-secret",
      },
    );

    expect(environment).toMatch(/GARAGE_RPC_SECRET="[a-f0-9]{64}"/);
    expect(environment).toMatch(/GARAGE_ADMIN_TOKEN="[a-f0-9]{64}"/);
    expect(environment).toMatch(/GARAGE_METRICS_TOKEN="[a-f0-9]{64}"/);
    expect(environment).toContain('GARAGE_WEBUI_AUTH="operator:$2');
    expect(environment).not.toContain("webui-password");
    expect(environment).toContain('GARAGE_CAPACITY_BYTES="25000000000"');
    expect(environment).toContain('GARAGE_VENDURE_BUCKET="vendure-assets"');
    expect(environment).not.toContain("GARAGE_POSTGRES_BACKUP_BUCKET");
    expect(environment).toContain('GARAGE_VENDURE_ACCESS_KEY_ID="GKTEST"');
    expect(environment).toContain(
      'GARAGE_VENDURE_SECRET_ACCESS_KEY="s3-secret"',
    );
    expect(garageService.composeFile).toContain("/v2/UpdateClusterLayout");
    expect(garageService.composeFile).toContain("/v2/ApplyClusterLayout");
    expect(garageService.composeFile).toContain(
      'status.get("nodes", []) if item.get("isUp")',
    );
    expect(garageService.composeFile).not.toContain('status["node"]');
    expect(garageService.composeFile).toContain(
      'entrypoint: ["python"]\n    command:\n      - "-c"',
    );
    expect(garageService.composeFile).toContain("/v2/ImportKey");
    expect(garageService.composeFile).toContain("/v2/CreateBucket");
    expect(garageService.composeFile).toContain("/v2/AllowBucketKey");
    expect(garageService.composeFile).not.toContain(
      "GARAGE_POSTGRES_BACKUP_BUCKET",
    );
  });

  it("publishes only the Garage connection settings to the project", () => {
    const context = {
      services: [],
      projectEnvironment: "",
      parameters: {
        assetUrlPrefix: "https://vendure.example.com/assets/",
        s3Endpoint: "https://s3.example.com",
        s3Bucket: "vendure-assets",
        s3AccessKeyId: "GKTEST",
        s3SecretAccessKey: "s3-secret",
      },
    };

    expect(resolveComposeProjectEnvironment(garageService, context)).toBe(
      [
        'ASSET_URL_PREFIX="https://vendure.example.com/assets/"',
        'S3_ENDPOINT="https://s3.example.com"',
        'S3_REGION="garage"',
        'S3_BUCKET="vendure-assets"',
        'S3_ACCESS_KEY_ID="GKTEST"',
        'S3_SECRET_ACCESS_KEY="s3-secret"',
      ].join("\n"),
    );
    expect(
      resolveComposeProjectEnvironmentKeys(garageService, context),
    ).toEqual(
      new Set([
        "ASSET_URL_PREFIX",
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ]),
    );
  });
});
