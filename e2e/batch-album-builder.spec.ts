import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";

const wavA = path.join(process.cwd(), "test-fixtures/compatibility/wav_mono_44k_short.wav");
const wavB = path.join(
  process.cwd(),
  "test-fixtures/compatibility/wav_stereo_44k_short.wav",
);
const hasWav = fs.existsSync(wavA) && fs.existsSync(wavB);

test.describe("batch album builder", () => {
  test.skip(!hasWav, "run pnpm compatibility:fixtures for WAV sources");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Converter", exact: true }).click();
    await page.getByTestId("converter-mode-batch").click();
    await page.getByTestId("batch-album-mode-toggle").locator("input").check();
    await expect(page.getByTestId("batch-album-builder")).toBeVisible();
  });

  test("imports multiple files and edits album title", async ({ page }) => {
    await page.getByTestId("batch-file-input").setInputFiles([wavA, wavB]);
    await expect(page.getByTestId("batch-album-track-row")).toHaveCount(2, { timeout: 15_000 });
    await page.getByTestId("batch-album-title").fill("Synthetic Batch Album");
    await expect(page.getByTestId("batch-album-title")).toHaveValue("Synthetic Batch Album");
    await expect(page.getByTestId("batch-album-preview")).toContainText(/Tracks:/);
  });

  test("reorders tracks in metadata table", async ({ page }) => {
    await page.getByTestId("batch-file-input").setInputFiles([wavA, wavB]);
    await expect(page.getByTestId("batch-album-track-row")).toHaveCount(2, { timeout: 15_000 });
    const firstBefore = await page.getByTestId("batch-album-track-title-0").inputValue();
    await page.getByTestId("batch-album-move-down-0").click();
    const firstAfter = await page.getByTestId("batch-album-track-title-0").inputValue();
    expect(firstAfter).not.toBe(firstBefore);
  });

  test("exports embedded .mp5p and imports in player", async ({ page }) => {
    test.setTimeout(300_000);

    await page.getByTestId("batch-file-input").setInputFiles([wavA, wavB]);
    await expect(page.getByTestId("batch-album-track-row")).toHaveCount(2, { timeout: 15_000 });
    await page.getByTestId("batch-album-title").fill("E2E Embedded Batch");
    await page.getByTestId("batch-album-target-embedded").click();

    await page.getByTestId("batch-start").click();
    await expect(page.getByTestId("batch-progress-summary")).toContainText("Completed: 2", {
      timeout: 180_000,
    });

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByTestId("batch-album-export-embedded").click();
    const download = await downloadPromise;
    const outPath = path.join(os.tmpdir(), `mp5-batch-album-${Date.now()}.mp5p`);
    await download.saveAs(outPath);
    expect(fs.statSync(outPath).size).toBeGreaterThan(1000);

    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(outPath);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("album-package-type")).toContainText("Embedded");
    await page.getByTestId("album-play-all").click();
    await expect(page.getByTestId("playlist-item")).toHaveCount(2, { timeout: 20_000 });
  });
});
