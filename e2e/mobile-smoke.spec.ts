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

test.describe("Mobile smoke", () => {
  test.use({ viewport: MOBILE });

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
    expect(playerBox?.height).toBeCloseTo(76, 1);

    const transport = page.getByTestId("persistent-transport");
    await expect(transport).toBeVisible();
    const transportBox = await transport.boundingBox();
    expect(transportBox).not.toBeNull();
    expect((transportBox?.y ?? 0) + (transportBox?.height ?? 0)).toBeCloseTo(
      playerBox?.y ?? 0,
      1,
    );

    await page.getByTestId("app-tab-converter").click();
    await expect(page.getByTestId("app-tab-converter")).toHaveAttribute("aria-current", "page");

    const converterBox = await nav.boundingBox();
    expect(converterBox).not.toBeNull();
    expect(converterBox?.height).toBeCloseTo(playerBox?.height ?? 0, 1);
    expect(converterBox?.y).toBeCloseTo(playerBox?.y ?? 0, 1);
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
