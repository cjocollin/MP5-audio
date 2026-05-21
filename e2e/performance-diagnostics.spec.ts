import { test, expect } from "@playwright/test";

test.describe("performance diagnostics", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  });

  test("settings shows diagnostics and reliability note", async ({ page }) => {
    await expect(page.getByTestId("settings-reliability-note")).toContainText("FFmpeg");
    await expect(page.getByTestId("performance-diagnostics")).toBeVisible();
    await page.getByTestId("performance-diagnostics").locator("summary").click();
    await expect(page.getByTestId("performance-diagnostics")).toContainText("Decode cache");
    await expect(page.getByTestId("performance-diagnostics")).toContainText("WASM");
  });
});
