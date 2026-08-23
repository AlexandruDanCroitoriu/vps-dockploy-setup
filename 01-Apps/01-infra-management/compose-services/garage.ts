import { randomBytes } from "node:crypto";

import { hashSync } from "bcryptjs";

import type { ComposeServiceDefinition } from "./registry";

function environmentLine(name: string, value: string) {
  return `${name}=${JSON.stringify(value)}`;
}

export function buildGarageEnvironment(
  loginPassword = randomBytes(24).toString("base64url"),
  loginUsername = "admin",
  capacityGb = 20,
) {
  return [
    environmentLine("GARAGE_RPC_SECRET", randomBytes(32).toString("hex")),
    environmentLine("GARAGE_ADMIN_TOKEN", randomBytes(32).toString("hex")),
    environmentLine("GARAGE_METRICS_TOKEN", randomBytes(32).toString("hex")),
    environmentLine(
      "GARAGE_WEBUI_AUTH",
      `${loginUsername}:${hashSync(loginPassword, 10)}`,
    ),
    environmentLine(
      "GARAGE_CAPACITY_BYTES",
      String(capacityGb * 1_000_000_000),
    ),
  ].join("\n");
}

export const garageService = {
  id: "garage-with-webui",
  name: "Garage with UI",
  description:
    "S3-compatible object storage with the Garage administration UI.",
  composeFile: `services:
  garage:
    image: dxflrs/garage:v2.3.0
    restart: unless-stopped
    expose:
      - "3900"
      - "3901"
      - "3903"
    environment:
      GARAGE_RPC_SECRET: \${GARAGE_RPC_SECRET}
      GARAGE_ADMIN_TOKEN: \${GARAGE_ADMIN_TOKEN}
      GARAGE_METRICS_TOKEN: \${GARAGE_METRICS_TOKEN}
    configs:
      - source: garage-config
        target: /etc/garage.toml
    volumes:
      - garage-meta:/var/lib/garage/meta
      - garage-data:/var/lib/garage/data

  garage-webui:
    image: khairul169/garage-webui:1.1.0
    restart: unless-stopped
    depends_on:
      - garage
    expose:
      - "3909"
    environment:
      API_BASE_URL: http://garage:3903
      API_ADMIN_KEY: \${GARAGE_ADMIN_TOKEN}
      S3_ENDPOINT_URL: http://garage:3900
      S3_REGION: garage
      AUTH_USER_PASS: \${GARAGE_WEBUI_AUTH}
    configs:
      - source: garage-config
        target: /etc/garage.toml

  garage-init:
    image: python:3.13-alpine
    restart: "no"
    depends_on:
      - garage
    environment:
      GARAGE_ADMIN_TOKEN: \${GARAGE_ADMIN_TOKEN}
      GARAGE_CAPACITY_BYTES: \${GARAGE_CAPACITY_BYTES}
    entrypoint: ["python"]
    command:
      - "-c"
      - |
        import json, os, time, urllib.request
        base = "http://garage:3903"
        headers = {"Authorization": "Bearer " + os.environ["GARAGE_ADMIN_TOKEN"]}
        def request(path, body=None):
            data = None if body is None else json.dumps(body).encode()
            req = urllib.request.Request(base + path, data=data, headers={**headers, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as response:
                return json.load(response)
        for attempt in range(60):
            try:
                status = request("/v2/GetClusterStatus")
                break
            except Exception:
                if attempt == 59: raise
                time.sleep(2)
        node = next((item["id"] for item in status.get("nodes", []) if item.get("isUp")), None)
        if not node:
            raise RuntimeError("Garage reported no active node to initialize")
        layout = request("/v2/GetClusterLayout")
        if not any(role["id"] == node for role in layout["roles"]):
            if not any(role["id"] == node for role in layout["stagedRoleChanges"]):
                request("/v2/UpdateClusterLayout", {"parameters": None, "roles": [{"id": node, "zone": "local", "capacity": int(os.environ["GARAGE_CAPACITY_BYTES"]), "tags": []}]})
                layout = request("/v2/GetClusterLayout")
            request("/v2/ApplyClusterLayout", {"version": layout["version"] + 1})

configs:
  garage-config:
    content: |
      metadata_dir = "/var/lib/garage/meta"
      data_dir = "/var/lib/garage/data"
      db_engine = "sqlite"
      replication_factor = 1

      rpc_bind_addr = "[::]:3901"
      rpc_public_addr = "garage:3901"
      rpc_secret = "\${GARAGE_RPC_SECRET}"

      [s3_api]
      s3_region = "garage"
      api_bind_addr = "[::]:3900"

      [admin]
      api_bind_addr = "[::]:3903"
      admin_token = "\${GARAGE_ADMIN_TOKEN}"
      metrics_token = "\${GARAGE_METRICS_TOKEN}"

volumes:
  garage-meta:
  garage-data:
`,
  environmentVariables: ({ loginCredentials, parameters }) =>
    buildGarageEnvironment(
      loginCredentials?.password,
      loginCredentials?.username,
      Number(parameters?.garageCapacityGb || 20),
    ),
  requiresLoginCredentials: true,
  parameterNames: ["garageCapacityGb"],
  domain: {
    serviceName: "garage-webui",
    defaultSubdomain: "garage",
    port: 3909,
    generateByDefault: true,
    httpsByDefault: true,
    required: false,
  },
} satisfies ComposeServiceDefinition;
