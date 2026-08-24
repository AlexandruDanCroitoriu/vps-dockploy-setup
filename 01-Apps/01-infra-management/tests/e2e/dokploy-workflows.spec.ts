import { expect, test } from "@playwright/test";

const enabled = process.env.E2E_DOKPLOY === "1";
test.describe("connected Dokploy workflows", () => {
  test.skip(
    !enabled,
    "Requires an authenticated test deployment connected to Dokploy.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(process.env.E2E_USERNAME || "");
    await page.getByLabel("Password").fill(process.env.E2E_PASSWORD || "");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/$/);
    const dokployLink = page.getByRole("link", { name: "Dokploy" });
    if (!(await dokployLink.isVisible())) {
      await page.locator("#dockploy-instance").selectOption({ index: 1 });
      await expect(dokployLink).toBeVisible();
    }
  });

  test("projects, services, databases, domains, and deployments are reachable", async ({
    page,
  }) => {
    await page.getByRole("link", { name: "Dokploy" }).click();
    await expect(page.getByRole("heading", { name: "Dokploy" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New project" }),
    ).toBeVisible();
    const project = page.locator("article").first();
    await expect(project).toBeVisible();
    await project.getByRole("link").first().click();
    await expect(
      page.getByRole("button", { name: "Add database" }),
    ).toBeVisible();
    const serviceLink = page.locator('a[href*="/services/"]').first();
    await serviceLink.click();
    await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: "Domains" })
        .or(page.getByRole("button", { name: /Deployment logs/ })),
    ).toBeVisible();
  });
});
