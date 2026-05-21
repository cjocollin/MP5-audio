import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const karaokeFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");
const hasFixture = fs.existsSync(karaokeFixture);

test.describe("karaoke / synced lyrics UI", () => {
  test.skip(!hasFixture, "run pnpm fixtures:generate for demo_mp5l_v3_stems.mp5");

  test("shows synced lyrics and karaoke mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();

    await page.getByTestId("player-file-input").setInputFiles(karaokeFixture);

    await expect(page.getByTestId("lyrics-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("lyrics-sync-indicator")).toContainText("Synced");
    await expect(page.getByTestId("lyrics-karaoke-availability")).toContainText(
      /available|instrumental/i,
    );
    await expect(page.getByTestId("lyrics-synced-line")).toHaveCount(5);

    await page.getByTestId("karaoke-mode-toggle").click();
    await expect(page.getByTestId("karaoke-mode-toggle")).toContainText("on");
    await expect(page.getByTestId("stems-mix-active-note").or(page.getByTestId("stems-item-loaded"))).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("lyrics-synced-line").nth(1).click();
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("mp5-player")).toBeVisible();
  });

  test("plain demo has no synced lyrics panel content", async ({ page }) => {
    const plain = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
    test.skip(!fs.existsSync(plain), "missing demo_mp5l_v3_tone.mp5");

    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(plain);
    await expect.poll(() => page.getByTestId("playlist-item").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("lyrics-empty")).toBeVisible();
    await expect(page.getByTestId("karaoke-mode-toggle")).toHaveCount(0);
  });
});
