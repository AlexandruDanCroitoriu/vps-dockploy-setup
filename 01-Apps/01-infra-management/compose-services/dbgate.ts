import { randomBytes } from "node:crypto";

import {
  parseDokployEnvironmentEntries,
  type DokployService,
} from "@/lib/dokploy";

import type { ComposeServiceDefinition } from "./registry";

function quoteEnvironmentValue(value: string) {
  return JSON.stringify(value);
}

function environmentLine(name: string, value: string) {
  return `${name}=${quoteEnvironmentValue(value)}`;
}

export function buildDbGateEnvironment(
  services: readonly DokployService[],
  loginPassword = randomBytes(24).toString("base64url"),
  loginUsername = "admin",
) {
  const postgres = services.find((service) => service.type === "postgres");
  const redis = services.find((service) => service.type === "redis");
  const connections = [postgres ? "postgres" : "", redis ? "redis" : ""]
    .filter(Boolean)
    .join(",");
  const lines = [
    environmentLine("DBGATE_LOGIN", loginUsername),
    environmentLine("DBGATE_PASSWORD", loginPassword),
    environmentLine("DBGATE_CONNECTIONS", connections),
  ];

  return lines.join("\n");
}

function projectReference(name: string) {
  return `${name}=\${{project.${name}}}`;
}

export function buildDbGateServiceReferences(
  services: readonly DokployService[],
) {
  const hasPostgres = services.some((service) => service.type === "postgres");
  const hasRedis = services.some((service) => service.type === "redis");
  return [
    "DBGATE_LOGIN",
    "DBGATE_PASSWORD",
    "DBGATE_CONNECTIONS",
    ...(hasPostgres
      ? [
          "POSTGRES_HOST",
          "POSTGRES_PORT",
          "POSTGRES_USER",
          "POSTGRES_PASSWORD",
          "POSTGRES_DATABASE",
        ]
      : []),
    ...(hasRedis ? ["REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD"] : []),
  ]
    .map(projectReference)
    .join("\n");
}

export const dbGateService = {
  id: "dbgate",
  name: "DBGate",
  description:
    "Database administration UI with automatic PostgreSQL and Redis connections.",
  composeFile: `services:
  dbgate:
    image: dbgate/dbgate:latest
    restart: unless-stopped
    expose:
      - "3000"
    environment:
      LOGIN: \${DBGATE_LOGIN}
      PASSWORD: \${DBGATE_PASSWORD}
      CONNECTIONS: \${DBGATE_CONNECTIONS}

      LABEL_postgres: \${POSTGRES_LABEL:-PostgreSQL}
      SERVER_postgres: \${POSTGRES_HOST:-}
      PORT_postgres: \${POSTGRES_PORT:-5432}
      USER_postgres: \${POSTGRES_USER:-}
      PASSWORD_postgres: \${POSTGRES_PASSWORD:-}
      DATABASE_postgres: \${POSTGRES_DATABASE:-}
      ENGINE_postgres: \${POSTGRES_ENGINE:-postgres@dbgate-plugin-postgres}

      LABEL_redis: \${REDIS_LABEL:-Redis}
      SERVER_redis: \${REDIS_HOST:-}
      PORT_redis: \${REDIS_PORT:-6379}
      USER_redis: \${REDIS_USER:-default}
      PASSWORD_redis: \${REDIS_PASSWORD:-}
      ENGINE_redis: \${REDIS_ENGINE:-redis@dbgate-plugin-redis}
    volumes:
      - dbgate-data:/root/.dbgate
    networks:
      - dokploy-network

volumes:
  dbgate-data:

networks:
  dokploy-network:
    external: true
`,
  environmentVariables: ({
    services,
    projectEnvironment,
    loginCredentials,
  }) => {
    const existing = parseDokployEnvironmentEntries(projectEnvironment);
    return buildDbGateEnvironment(
      services,
      loginCredentials?.password || existing.DBGATE_PASSWORD || undefined,
      loginCredentials?.username || existing.DBGATE_LOGIN || "admin",
    );
  },
  serviceEnvironmentVariables: ({ services }) =>
    buildDbGateServiceReferences(services),
  environmentTarget: "project",
  requiresLoginCredentials: true,
  domain: {
    serviceName: "dbgate",
    defaultSubdomain: "dbgate",
    port: 3000,
    httpsByDefault: true,
    required: true,
  },
} satisfies ComposeServiceDefinition;
