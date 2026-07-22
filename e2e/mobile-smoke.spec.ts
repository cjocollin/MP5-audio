import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { dismissWelcomeOnboarding } from "./helpers/onboarding";

const MOBILE = { width: 375, height: 812 };
const embeddedFixture = path.join(
  process.cwd(),
  "test-fixtures/demo_embedded_album_package.mp5p",
);
const hasEmbedded = fs.existsSync(embeddedFixture);
const wavFixture = path.join(
  process.cwd(),
  "test-fixtures/compatibility/wav_stereo_44k_short.wav",
);
const hasWavFixture = fs.existsSync(wavFixture);

test.describe("Mobile smoke", () => {
  test.use({ viewport: MOBILE, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await dismissWelcomeOnboarding(page);
  });

  test("tabs visible and tappable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("app-tab-player")).toBeVisible();
    await expect(page.getByTestId("app-tab-converter")).toBeVisible();
    await expect(page.getByTestId("app-tab-demo")).toBeVisible();
    await page.getByTestId("app-tab-demo").click();
    await expect(page.getByTestId("demo-path-a")).toBeVisible();
  });

  test("bottom navigation keeps the same geometry across tabs", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByTestId("app-main-nav");
    await expect(nav).toBeVisible();

    const playerBox = await nav.boundingBox();
    expect(playerBox).not.toBeNull();
    expect(playerBox?.height).toBeCloseTo(104, 1);

    const transport = page.getByTestId("persistent-transport");
    await expect(transport).toBeVisible();
    const transportBox = await transport.boundingBox();
    expect(transportBox).not.toBeNull();
    expect((transportBox?.y ?? 0) + (transportBox?.height ?? 0)).toBeCloseTo(
      playerBox?.y ?? 0,
      1,
    );

    for (let pass = 0; pass < 3; pass += 1) {
      await page.getByTestId("app-tab-converter").click();
      await expect(page.getByTestId("app-tab-converter")).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("converter-panel")).toBeVisible();
      await expect(transport).toBeVisible();
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));

      const converterBox = await nav.boundingBox();
      const converterTransportBox = await transport.boundingBox();
      expect(converterBox).not.toBeNull();
      expect(converterTransportBox).not.toBeNull();
      expect(converterBox?.height).toBeCloseTo(playerBox?.height ?? 0, 1);
      expect(converterBox?.y).toBeCloseTo(playerBox?.y ?? 0, 1);
      expect(
        (converterTransportBox?.y ?? 0) + (converterTransportBox?.height ?? 0),
      ).toBeCloseTo(converterBox?.y ?? 0, 1);

      await page.getByTestId("app-tab-player").click();
      await expect(page.getByTestId("mp5-player")).toBeVisible();
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      const restoredPlayerBox = await nav.boundingBox();
      expect(restoredPlayerBox?.height).toBeCloseTo(playerBox?.height ?? 0, 1);
      expect(restoredPlayerBox?.y).toBeCloseTo(playerBox?.y ?? 0, 1);
    }
  });

  test("converter keeps the three-stage mobile Export Desk intact", async ({ page }) => {
    test.skip(!hasWavFixture, "run pnpm compatibility:fixtures");
    await page.goto("/");
    await page.getByTestId("app-tab-converter").click();
    const panel = page.getByTestId("converter-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("codec-select")).toHaveValue("mp5l_v4");

    await page.getByTestId("converter-file-input").setInputFiles(wavFixture);
    await expect(page.getByTestId("converter-source-card")).toBeVisible({ timeout: 60_000 });
    await expect(panel).toHaveAttribute("data-stage", "metadata");
    await expect(page.getByTestId("metadata-editor")).toBeVisible();
    await expect(page.getByTestId("converter-output-rail")).not.toBeVisible();
    await expect(page.getByTestId("convert-status-mobile")).toContainText("MP5-L v4");

    await page.getByTestId("converter-mobile-metadata-done").click();
    await expect(panel).toHaveAttribute("data-stage", "export");
    await expect(page.getByTestId("converter-mobile-metadata-summary")).toBeVisible();
    await expect(page.getByTestId("converter-output-rail")).toBeVisible();

    const badgeBoxes = await page
      .getByLabel("Selected format qualities")
      .locator("span")
      .evaluateAll((badges) => badges.map((badge) => {
        const box = badge.getBoundingClientRect();
        return { x: box.x, y: box.y, right: box.right, height: box.height };
      }));
    expect(badgeBoxes).toHaveLength(3);
    expect(Math.max(...badgeBoxes.map((box) => box.y)) - Math.min(...badgeBoxes.map((box) => box.y))).toBeLessThan(2);
    expect(Math.max(...badgeBoxes.map((box) => box.right))).toBeLessThanOrEqual(MOBILE.width + 1);
  });

  test("player controls stay reachable without horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("app-tab-player").click();
    await expect(page.getByTestId("player-controls")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    const play = page.getByTestId("play-pause");
    const box = await play.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(56);
  });

  test("VISU stays in Now Playing only on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("app-tab-player").click();
    const visu = page.locator('[data-testid="visu-canvas"], .visu-canvas, [class*="visu"]').first();
    if (await visu.count()) {
      const box = await visu.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(MOBILE.width);
        expect(box.height).toBeLessThan(600);
      }
    }
  });

  test("album package view usable on mobile", async ({ page }) => {
    test.skip(!hasEmbedded, "run pnpm fixtures:embedded-album");
    await page.goto("/");
    await page.getByTestId("app-tab-player").click();
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 30_000 });
    const playBtn = page.getByTestId("album-play-all");
    await expect(playBtn).toBeVisible();
    const box = await playBtn.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(36);
    }
  });
});
