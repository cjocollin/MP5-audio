import { test, expect } from "@playwright/test";
import { loadDemoFromSettings } from "./helpers/demoFixtures";
import { dismissWelcomeOnboarding } from "./helpers/onboarding";

test.describe("direct-entry public experience", () => {
  test.beforeEach(async ({ page }) => {
    await dismissWelcomeOnboarding(page);
    await page.goto("/");
  });

  test("opens directly into an empty Player workspace", async ({ page }) => {
    await expect(page.getByTestId("app-shell-header")).toBeVisible();
    await expect(page.getByTestId("public-beta-notice")).toBeVisible();
    await expect(page.getByTestId("app-main-nav")).toBeVisible();
    await expect(page.getByTestId("app-tab-player")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("mp5-player")).toBeVisible();
    await expect(page.getByTestId("player-empty-state")).toBeVisible();
    await expect(page.getByTestId("playlist-item")).toHaveCount(0);
    await expect(page.getByTestId("demo-fixture-actions")).toHaveCount(0);
    await expect(page.locator(".mp5-inspector-tabs")).toHaveCount(0);
  });

  test("Demo tab can load the synthetic MP5-L demo", async ({ page }) => {
    await loadDemoFromSettings(page);
    await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId("now-playing-title")).toContainText("Demo tone");
    await expect(page.getByTestId("now-playing-badges")).toContainText("MP5-L v3");
    await expect(page.getByTestId("now-playing-badges")).toContainText("Lossless");
    await expect(page.getByTestId("now-playing-badges")).toContainText("Bit-exact");
  });

  test("Learn more opens the current Public Beta guidance", async ({ page }) => {
    await page
      .getByTestId("public-beta-notice")
      .getByRole("button", { name: "Learn more", exact: true })
      .click();

    const about = page.getByTestId("about-mp5-panel");
    await expect(about).toBeVisible();
    await expect(about).toContainText("MP5-C2");
    await expect(about).toContainText("user/artist-provided stems");
    await expect(about).toContainText("no AI stem separation");
    await expect(about).toContainText(/does not claim to beat/i);
  });

  test("primary workspaces remain reachable from the redesigned shell", async ({ page }) => {
    await page.getByTestId("app-tab-converter").click();
    await expect(page.getByTestId("converter-panel")).toBeVisible();

    await page.getByTestId("app-tab-demo").click();
    await expect(page.getByTestId("demo-mode-panel")).toBeVisible();
    await expect(page.getByTestId("demo-fixture-actions")).toBeVisible();

    await page.getByTestId("app-tab-library").click();
    await expect(page.getByTestId("local-library-panel")).toBeVisible();

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("performance-diagnostics")).toBeVisible();
    await expect(page.getByTestId("demo-fixture-actions")).toHaveCount(0);
    await expect(page.getByTestId("settings-demo-tab-link")).toBeVisible();

    await page.getByTestId("app-tab-player").click();
    await expect(page.getByTestId("mp5-player")).toBeVisible();
  });

  test("shell reports the integrated 0.27.0 Public Beta version", async ({ page }) => {
    const header = page.getByTestId("app-shell-header");
    await expect(header).toContainText("MP5 Audio");
    await expect(header).toContainText("Public Beta");
    await expect(header).toContainText("v0.29.0-beta");
  });
});
