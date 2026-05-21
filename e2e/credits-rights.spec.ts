import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const toneFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
const wavFixture = path.join(process.cwd(), "test-fixtures/compatibility/wav_mono_44k_short.wav");
const hasPlayerFixture = fs.existsSync(toneFixture);
const hasWavFixture = fs.existsSync(wavFixture);

test.describe("credits / rights metadata", () => {
  test("converter exposes collapsed credits and rights sections", async ({ page }) => {
    test.skip(!hasWavFixture, "run pnpm compatibility:fixtures");
    await page.goto("/");
    await page.getByRole("button", { name: "Converter", exact: true }).click();
    await expect(page.getByTestId("converter-panel")).toBeVisible();
    await page.getByTestId("converter-file-input").setInputFiles([wavFixture]);
    await expect(page.getByTestId("metadata-editor")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("credits-metadata-toggle")).toBeVisible();
    await expect(page.getByTestId("rights-metadata-toggle")).toBeVisible();
    await expect(page.getByTestId("identifiers-metadata-toggle")).toBeVisible();
    await page.getByTestId("credits-metadata-toggle").click();
    await expect(page.getByTestId("crdt-producer")).toBeVisible();
  });

  test("player metadata panel shows credits sections without blocking playback", async ({ page }) => {
    test.skip(!hasPlayerFixture, "run pnpm fixtures:generate");
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles([toneFixture]);
    await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("metadata-credits-panel")).toBeVisible();
    await expect(page.getByTestId("metadata-rights-panel")).toBeVisible();
    await expect(page.getByTestId("metadata-identifiers-panel")).toBeVisible();
    await page.getByTestId("playlist-item-play").click();
    await expect(page.getByTestId("now-playing")).toBeVisible({ timeout: 10_000 });
  });
});
