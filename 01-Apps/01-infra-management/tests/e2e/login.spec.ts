import { expect, test } from "@playwright/test";

test("redirects anonymous visitors to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your dashboard" }),
  ).toBeVisible();
});

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("invalid");
  await page.getByLabel("Password").fill("invalid");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid username or password",
  );
});
