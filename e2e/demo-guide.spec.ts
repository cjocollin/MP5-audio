import { test, expect } from "@playwright/test";
import { loadDemoFromSettings } from "./helpers/demoFixtures";

test.describe("demo guide", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("app-tab-demo").click();
  });

  test("shows guided paths A through E", async ({ page }) => {
    await expect(page.getByTestId("demo-mode-panel")).toBeVisible();
    for (const id of ["a", "b", "c", "d", "e"]) {
      await expect(page.getByTestId(`demo-path-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("demo-load-embedded-album")).toBeVisible();
    await expect(page.getByTestId("demo-fixture-actions")).toBeVisible();
    await expect(page.getByTestId("demo-open-settings-fixtures")).toHaveCount(0);
  });

  test("loads embedded album demo from demo tab", async ({ page }) => {
    await page.getByTestId("demo-load-embedded-album").click();
    await expect(page.getByTestId("app-tab-player")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("album-resolved-count")).toContainText("embedded");
  });

  test("load MP5-L demo from Demo tab", async ({ page }) => {
    await loadDemoFromSettings(page);
    await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 20_000 });
  });
});

test.describe("first visit", () => {
  test("shows Welcome onboarding without auto-loading demo audio", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("mp5-onboarding-v1"));
    await page.goto("/");
    await expect(page.getByTestId("welcome-onboarding")).toBeVisible();
    await expect(page.getByTestId("public-beta-notice")).toBeVisible();
    await expect(page.getByTestId("mp5-player")).toBeVisible();
    await expect(page.getByTestId("player-empty-state")).toBeVisible();
    await expect(page.getByTestId("playlist-item")).toHaveCount(0);
  });
});
