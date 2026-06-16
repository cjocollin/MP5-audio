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
