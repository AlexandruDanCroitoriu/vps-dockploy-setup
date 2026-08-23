import { randomBytes } from "node:crypto";

import type { ComposeServiceDefinition } from "./registry";

function environmentLine(name: string, value: string) {
  return `${name}=${JSON.stringify(value)}`;
}

export function buildPortainerEnvironment(
  username: string,
  password: string,
  setupToken = randomBytes(32).toString("base64url"),
) {
  return [
    environmentLine("PORTAINER_ADMIN_USERNAME", username),
    environmentLine("PORTAINER_ADMIN_PASSWORD", password),
    environmentLine("PORTAINER_SETUP_TOKEN", setupToken),
  ].join("\n");
}

export const portainerService = {
  id: "portainer",
  name: "Portainer",
  description:
    "Container management UI for deploying, troubleshooting, and securing Docker workloads.",
  composeFile: `services:
  portainer:
    image: portainer/portainer-ce:latest
    restart: unless-stopped
    command:
      - "--setup-token"
      - \${PORTAINER_SETUP_TOKEN}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer-data:/data
    expose:
      - "9000"

  portainer-init:
    image: python:3.13-alpine
    restart: unless-stopped
    depends_on:
      - portainer
    environment:
      PORTAINER_ADMIN_USERNAME: \${PORTAINER_ADMIN_USERNAME}
      PORTAINER_ADMIN_PASSWORD: \${PORTAINER_ADMIN_PASSWORD}
      PORTAINER_SETUP_TOKEN: \${PORTAINER_SETUP_TOKEN}
    entrypoint: ["python"]
    command:
      - "-c"
      - |
        import json, os, time, urllib.error, urllib.request
        body = json.dumps({"Username": os.environ["PORTAINER_ADMIN_USERNAME"], "Password": os.environ["PORTAINER_ADMIN_PASSWORD"]}).encode()
        request = urllib.request.Request("http://portainer:9000/api/users/admin/init", data=body, headers={"Content-Type": "application/json", "X-Setup-Token": os.environ["PORTAINER_SETUP_TOKEN"]})
        for attempt in range(60):
            try:
                with urllib.request.urlopen(request, timeout=5):
                    break
            except urllib.error.HTTPError as error:
                if error.code == 409:
                    break
                raise
            except urllib.error.URLError:
                if attempt == 59: raise
                time.sleep(2)
        while True:
            time.sleep(86400)

volumes:
  portainer-data: {}
`,
  environmentVariables: ({ loginCredentials }) =>
    buildPortainerEnvironment(
      loginCredentials?.username ?? "admin",
      loginCredentials?.password ?? "admin",
    ),
  requiresLoginCredentials: true,
  domain: {
    serviceName: "portainer",
    defaultSubdomain: "portainer",
    port: 9000,
    generateByDefault: true,
    httpsByDefault: true,
    required: false,
  },
} satisfies ComposeServiceDefinition;
