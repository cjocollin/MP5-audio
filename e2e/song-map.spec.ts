import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const demoFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");
const hasFixture = fs.existsSync(demoFixture);

test.describe("song map / sections UI", () => {
  test.skip(!hasFixture, "run pnpm fixtures:generate for demo_mp5l_v3_stems.mp5");

  test("shows song map, smart nav, and section jump", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(demoFixture);

    await expect(page.getByTestId("song-map-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("highlights-panel")).toBeVisible();
    await expect(page.getByTestId("song-map-list")).toBeVisible();
    await expect(page.getByTestId("song-map-section")).toHaveCount(5);

    await page.getByTestId("nav-jump-chorus").click();
    await page.getByTestId("nav-replay-hook").click();
    await page.getByTestId("nav-next-section").click();

    await expect(page.getByTestId("waveform-section-marker")).toHaveCount(5);
    await page.getByTestId("song-map-section").nth(2).click();
  });

  test("plain demo has empty song map", async ({ page }) => {
    const plain = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
    test.skip(!fs.existsSync(plain), "missing demo_mp5l_v3_tone.mp5");

    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(plain);
    await expect.poll(() => page.getByTestId("playlist-item").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("song-map-empty")).toBeVisible();
    await expect(page.getByTestId("nav-jump-chorus")).toHaveCount(0);
  });
});
