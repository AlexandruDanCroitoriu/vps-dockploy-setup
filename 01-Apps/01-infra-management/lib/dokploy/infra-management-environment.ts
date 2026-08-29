import "server-only";

function environmentLine(name: string, value: string) {
  return `${name}=${JSON.stringify(value)}`;
}

export function resolveInfraManagementHostname(
  subdomain: string,
  rootDomain: string,
) {
  const root = rootDomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  const prefix = subdomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  return prefix ? `${prefix}.${root}` : root;
}

export function serializeInfraManagementEnvironment(input: {
  username: string;
  password: string;
  authSecret: string;
  nextAuthUrl: string;
  cloudflareApiToken: string;
  resendApiKey: string;
}) {
  return [
    environmentLine("INFRA_SERVICES_DEFAULT_USERNAME", input.username),
    environmentLine("INFRA_SERVICES_DEFAULT_PASSWORD", input.password),
    environmentLine("AUTH_SECRET", input.authSecret),
    environmentLine("NEXTAUTH_URL", input.nextAuthUrl),
    environmentLine("CLOUDFLARE_API_TOKEN", input.cloudflareApiToken),
    environmentLine("RESEND_API_KEY", input.resendApiKey),
    environmentLine("PROJECT_BUILDS_ENABLED", "true"),
    environmentLine(
      "PROJECT_REPOSITORY_URL",
      "https://github.com/AlexandruDanCroitoriu/vps-dockploy-setup.git",
    ),
    environmentLine("PROJECT_REPOSITORY_BRANCH", "main"),
    environmentLine("PROJECT_REPOSITORY_PATH", "/app/data/repository"),
  ].join("\n");
}
