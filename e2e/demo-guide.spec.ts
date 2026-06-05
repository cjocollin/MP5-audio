import { test, expect } from "@playwright/test";

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
  });

  test("load MP5-L demo from demo tab", async ({ page }) => {
    await page.getByTestId("demo-load-demo-play").click();
    await expect(page.getByTestId("app-tab-player")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 20_000 });
  });
});

test.describe("onboarding", () => {
  test("welcome card shows on first visit", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("mp5-onboarding-v1"));
    await page.goto("/");
    await expect(page.getByTestId("welcome-onboarding")).toBeVisible();
    await page.getByTestId("welcome-dismiss").click();
    await expect(page.getByTestId("welcome-onboarding")).toHaveCount(0);
  });
});
