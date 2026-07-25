import { test, expect } from "@playwright/test";
import { loadDemoFromSettings } from "./helpers/demoFixtures";
import {
  parseDisplayedPlaybackTime,
  waitForPlaybackProgress,
  waitForSeekReady,
} from "./helpers/playbackTime";

const hostedUrl = process.env.MP5_HOSTED_URL;
test.skip(!hostedUrl, "Set MP5_HOSTED_URL to the deployed HTTPS origin");

const MOBILE = { width: 375, height: 812 };

/**
 * Hosted HTTPS demo validation — run with:
 * MP5_HOSTED_URL=https://your-app.vercel.app pnpm test:e2e:hosted
 */
test.describe("MP5 hosted demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const header = page.getByTestId("app-shell-header");
    await expect(header).toBeVisible();
    await expect(header).toContainText("MP5 Audio");
    await expect(header).toContainText("Public Beta");
    await expect(header).toContainText("v0.29.0-beta");
  });

  test("app shell and honest tagline", async ({ page }) => {
    await page
      .getByTestId("public-beta-notice")
      .getByRole("button", { name: "Learn more", exact: true })
      .click();
    const about = page.getByTestId("about-mp5-panel");
    await expect(about).toContainText(/does not claim to beat/i);
    await expect(about).toContainText("MP5-C2");
    await expect(about).toContainText(/lab \/ advanced/i);
    await expect(about).toContainText("no AI stem separation");
  });

  test("direct Player entry is empty until a demo is loaded from Settings", async ({ page }) => {
    await expect(page.getByTestId("mp5-player")).toBeVisible();
    await expect(page.getByTestId("player-empty-state")).toBeVisible();
    await expect(page.getByTestId("playlist-item")).toHaveCount(0);
    await loadDemoFromSettings(page);
    await expect(page.getByTestId("now-playing-title")).toContainText("Demo tone");
    await expect(page.getByTestId("now-playing-badges")).toContainText("MP5-L v3");
    await expect(page.getByTestId("now-playing-badges")).toContainText("Lossless");
    await expect(page.getByTestId("now-playing-badges")).toContainText("Bit-exact");
  });

  test("loads demo fixture and shows MP5-L v3 format panel", async ({ page }) => {
    await loadDemoFromSettings(page);
    await waitForSeekReady(page);
    await expect(page.getByTestId("now-playing-source-badge")).toContainText(".mp5");
    await expect(page.getByTestId("now-playing-duration")).toContainText(/:/);
    await expect(page.getByTestId("now-playing-visu-fallback")).toContainText("Default visual");
    await expect(page.getByTestId("player-controls")).toBeVisible();
    await expect(page.getByTestId("remaining-time")).toContainText("-");
    await expect(page.getByText(/MP5-L/i).first()).toBeVisible();
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause", {
      timeout: 20_000,
    });
    await waitForPlaybackProgress(page);
    expect(parseDisplayedPlaybackTime(await page.getByTestId("current-time").textContent())).toBeGreaterThan(0);
  });

  test("demo guide opens with paths A-E", async ({ page }) => {
    await page.getByTestId("app-tab-demo").click();
    await expect(page.getByTestId("demo-mode-panel")).toBeVisible();
    for (const id of ["a", "b", "c", "d", "e"]) {
      await expect(page.getByTestId(`demo-path-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("demo-load-embedded-album")).toBeVisible();
  });

  test("karaoke demo loads and enables karaoke mode", async ({ page }) => {
    await loadDemoFromSettings(page, { mode: "stems" });
    await waitForSeekReady(page);
    await page.locator('[data-inspector-id="lyrics"]').click();
    await expect(page.getByTestId("lyrics-panel")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("karaoke-mode-toggle").click();
    await expect(page.getByTestId("karaoke-mode-toggle")).toContainText("on");
    await expect(page.getByTestId("play-pause")).toBeEnabled({ timeout: 90_000 });
    const visuContained = await page.getByTestId("now-playing-theme-card").evaluate((card) => {
      const root = document.querySelector('[data-testid="now-playing"]');
      if (!root) return false;
      const cardBox = card.getBoundingClientRect();
      const rootBox = root.getBoundingClientRect();
      return (
        cardBox.left >= rootBox.left - 1 &&
        cardBox.right <= rootBox.right + 1 &&
        cardBox.top >= rootBox.top - 1 &&
        cardBox.bottom <= rootBox.bottom + 1
      );
    });
    expect(visuContained).toBe(true);
  });

  test("embedded album demo loads album view", async ({ page }) => {
    await page.getByTestId("app-tab-demo").click();
    await page.getByTestId("demo-load-embedded-album").click();
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("album-resolved-count")).toContainText("embedded");
    await expect(page.getByTestId("album-play-all")).toBeVisible();
    await page.getByTestId("album-play-all").click();
    await expect(page.getByTestId("playlist-item")).toHaveCount(2, { timeout: 20_000 });
    await expect(page.getByTestId("now-playing-source-badge")).toContainText("embedded .mp5p", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("now-playing-album-position")).toContainText(/Track 1 of 2/i);
    await expect(page.getByTestId("player-controls")).toBeVisible();
    await expect(page.getByTestId("player-next")).toBeVisible();
    await expect(page.getByTestId("player-prev")).toBeVisible();
  });

  test("converter tab loads", async ({ page }) => {
    await page.getByRole("button", { name: "Converter", exact: true }).click();
    await expect(page.getByTestId("converter-panel")).toBeVisible();
  });

  test("batch album builder, library, settings and diagnostics reachable", async ({ page }) => {
    await page.getByTestId("app-tab-converter").click();
    await page.getByTestId("converter-mode-batch").click();
    await expect(page.getByTestId("batch-converter-panel")).toBeVisible();
    await page.getByTestId("batch-album-mode-toggle").check();
    await expect(page.getByTestId("batch-album-builder")).toBeVisible();

    await page.getByTestId("app-tab-library").click();
    await expect(page.getByTestId("local-library-panel")).toBeVisible();
    await expect(page.getByTestId("local-library-storage-honesty")).toBeVisible();

    await page.getByTestId("app-tab-settings").click();
    await expect(page.getByTestId("performance-diagnostics")).toBeVisible();
    await page.getByTestId("performance-diagnostics").click();
    await expect(page.getByTestId("diagnostics-copy-report")).toBeVisible();
    await expect(page.getByTestId("beta-feedback-panel")).toBeVisible();
    await expect(page.getByTestId("feedback-bug-report-link")).toBeVisible();
    await page.getByTestId("playback-trace-toggle").check();
    await expect(page.getByTestId("playback-trace-copy")).toBeVisible();
  });
});

test.describe("MP5 hosted demo mobile", () => {
  test.use({ viewport: MOBILE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("direct Player workspace fits mobile without horizontal overflow", async ({ page }) => {
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 2);
    await expect(page.getByTestId("mp5-player")).toBeVisible();
    const box = await page.getByTestId("app-tab-player").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("tabs tappable on mobile", async ({ page }) => {
    for (const tab of ["player", "converter", "library", "demo", "settings"]) {
      const btn = page.getByTestId(`app-tab-${tab}`);
      await expect(btn).toBeVisible();
      const b = await btn.boundingBox();
      expect(b?.height ?? 0).toBeGreaterThanOrEqual(32);
      await btn.click();
    }
    await expect(page.getByTestId("performance-diagnostics")).toBeVisible();
  });

  test("embedded album view readable on mobile", async ({ page }) => {
    await page.getByTestId("app-tab-demo").click();
    await page.getByTestId("demo-load-embedded-album").click();
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 45_000 });
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 2);
    const box = await page.getByTestId("album-play-all").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
  });
});
