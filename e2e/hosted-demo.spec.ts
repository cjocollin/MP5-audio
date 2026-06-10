import { test, expect } from "@playwright/test";
import { dismissWelcomeOnboarding } from "./helpers/onboarding";
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
    await dismissWelcomeOnboarding(page);
    await page.goto("/");
    await expect(page.getByTestId("landing-headline")).toHaveText("MP5 Audio");
    await expect(page.getByTestId("app-version")).toContainText("MP5 Public Beta");
    await expect(page.getByTestId("app-version")).toContainText("v0.16.2-beta");
  });

  test("app shell and honest tagline", async ({ page }) => {
    await page.getByTestId("landing-about-toggle").click();
    await expect(page.getByTestId("landing-honesty-claim")).toContainText(
      "does not claim to beat MP3",
    );
    await expect(page.getByTestId("landing-demo-url")).toContainText("mp5-audio.vercel.app");
    await expect(page.getByTestId("landing-codec-mp5c")).toContainText(/lab|experimental/i);
    await expect(page.getByTestId("landing-honesty-claim")).toContainText("does not claim to beat MP3");
  });

  test("compact landing and format messaging", async ({ page }) => {
    await expect(page.getByTestId("landing-subheadline")).toContainText("experimental");
    await expect(page.getByTestId("landing-format-explainer")).toContainText(".mp5");
    await expect(page.getByTestId("landing-format-explainer")).toContainText(".mp5p");
    await expect(page.getByTestId("landing-format-explainer")).toContainText("Experimental");
    await expect(page.getByTestId("landing-about-collapsed-hint")).toBeVisible();
  });

  test("loads demo fixture and shows MP5-L v3 format panel", async ({ page }) => {
    await page.getByTestId("landing-try-demo").click({ timeout: 15_000 });
    await waitForSeekReady(page);
    await expect(page.getByText(/MP5-L/i).first()).toBeVisible();
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause", {
      timeout: 20_000,
    });
    await waitForPlaybackProgress(page);
    expect(parseDisplayedPlaybackTime(await page.getByTestId("current-time").textContent())).toBeGreaterThan(0);
  });

  test("demo guide opens with paths A-E", async ({ page }) => {
    await page.getByTestId("landing-open-demo-guide").click();
    await expect(page.getByTestId("demo-mode-panel")).toBeVisible();
    for (const id of ["a", "b", "c", "d", "e"]) {
      await expect(page.getByTestId(`demo-path-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("demo-load-embedded-album")).toBeVisible();
  });

  test("karaoke demo loads and enables karaoke mode", async ({ page }) => {
    await page.getByTestId("app-tab-demo").click();
    await page.getByTestId("demo-load-stems-demo").click();
    await waitForSeekReady(page);
    await expect(page.getByTestId("lyrics-panel")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("karaoke-mode-toggle").click();
    await expect(page.getByTestId("karaoke-mode-toggle")).toContainText("on");
    await expect(page.getByTestId("play-pause")).toBeEnabled({ timeout: 90_000 });
  });

  test("embedded album demo loads album view", async ({ page }) => {
    await page.getByTestId("app-tab-demo").click();
    await page.getByTestId("demo-load-embedded-album").click();
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("album-resolved-count")).toContainText("embedded");
    await expect(page.getByTestId("album-play-all")).toBeVisible();
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
    await dismissWelcomeOnboarding(page);
    await page.goto("/");
  });

  test("landing fits mobile without horizontal overflow", async ({ page }) => {
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 2);
    const box = await page.getByTestId("landing-try-demo").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
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