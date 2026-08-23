import { randomBytes } from "node:crypto";

import { hashSync } from "bcryptjs";

import type { ComposeServiceDefinition } from "./registry";

function environmentLine(name: string, value: string) {
  return `${name}=${JSON.stringify(value)}`;
}

export function buildZotEnvironment(username: string, password: string) {
  if (!username || /[:\r\n]/.test(username)) {
    throw new Error("Zot usernames cannot contain colons or line breaks.");
  }

  return [
    environmentLine("ZOT_HTPASSWD", `${username}:${hashSync(password, 12)}`),
    environmentLine(
      "ZOT_SESSION_HASH_KEY",
      randomBytes(32).toString("hex"),
    ),
    environmentLine(
      "ZOT_SESSION_ENCRYPT_KEY",
      randomBytes(16).toString("hex"),
    ),
  ].join("\n");
}

export const zotService = {
  id: "zot",
  name: "Zot",
  description:
    "OCI container registry with authenticated push and pull access, search, and a web UI.",
  composeFile: `services:
  zot:
    image: ghcr.io/project-zot/zot:v2.1.20
    restart: unless-stopped
    expose:
      - "5000"
    configs:
      - source: zot-config
        target: /etc/zot/config.json
      - source: zot-htpasswd
        target: /etc/zot/htpasswd
      - source: zot-session-keys
        target: /etc/zot/session-keys.json
    volumes:
      - zot-data:/var/lib/registry

configs:
  zot-config:
    content: |
      {
        "distSpecVersion": "1.1.1",
        "storage": {
          "rootDirectory": "/var/lib/registry",
          "dedupe": true,
          "gc": true,
          "gcDelay": "1h",
          "gcInterval": "8h"
        },
        "http": {
          "address": "0.0.0.0",
          "port": "5000",
          "realm": "zot",
          "auth": {
            "htpasswd": { "path": "/etc/zot/htpasswd" },
            "sessionKeysFile": "/etc/zot/session-keys.json",
            "apikey": true
          }
        },
        "log": { "level": "info" },
        "extensions": {
          "search": { "enable": true },
          "ui": { "enable": true }
        }
      }
  zot-htpasswd:
    content: |
      \${ZOT_HTPASSWD}
  zot-session-keys:
    content: |
      {
        "hashKey": "\${ZOT_SESSION_HASH_KEY}",
        "encryptKey": "\${ZOT_SESSION_ENCRYPT_KEY}"
      }

volumes:
  zot-data: {}
`,
  environmentVariables: ({ loginCredentials }) =>
    buildZotEnvironment(
      loginCredentials?.username ?? "admin",
      loginCredentials?.password ?? "admin",
    ),
  requiresLoginCredentials: true,
  maxPerInstance: 1,
  domain: {
    serviceName: "zot",
    defaultSubdomain: "zot",
    port: 5000,
    generateByDefault: true,
    httpsByDefault: true,
    required: false,
  },
} satisfies ComposeServiceDefinition;
