import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000/login",
        reuseExistingServer: !process.env.CI,
        env: {
          ADMIN_USERNAME: "e2e-admin",
          ADMIN_PASSWORD_HASH:
            "$2b$12$OLLvKWAKujx.5yzTlG6p.eMZQGpGfaG4I36UxYr3RzluS.HTzEoB.",
          AUTH_SECRET: "e2e-only-secret-not-for-production-use",
          NEXTAUTH_URL: "http://127.0.0.1:3000",
          DOKPLOY_URL: "http://127.0.0.1:3999",
          DOKPLOY_API_KEY: "e2e-placeholder",
        },
      },
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
