import { defineConfig, devices } from "@playwright/test";

const localE2EUrl = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        url: `${localE2EUrl}/login`,
        reuseExistingServer: false,
        env: {
          NEXT_DIST_DIR: ".next-e2e",
          INFRA_SERVICES_DEFAULT_USERNAME: "e2e-admin",
          INFRA_SERVICES_DEFAULT_PASSWORD: "e2e-password",
          AUTH_SECRET: "e2e-only-secret-not-for-production-use",
          NEXTAUTH_URL: localE2EUrl,
          DOKPLOY_URL: "http://127.0.0.1:3999",
          DOKPLOY_API_KEY: "e2e-placeholder",
        },
      },
  use: {
    baseURL: process.env.E2E_BASE_URL || localE2EUrl,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
