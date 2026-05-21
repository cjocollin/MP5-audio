import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const albumManifest = path.join(process.cwd(), "test-fixtures/demo_album_package.mp5p");
const toneFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
const stemsFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");
const hasPackage = fs.existsSync(albumManifest) && fs.existsSync(toneFixture) && fs.existsSync(stemsFixture);

test.describe("album package (.mp5p)", () => {
  test.skip(!hasPackage, "run pnpm fixtures:generate and node scripts/generate-demo-album-package.mjs");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
  });

  test("imports manifest with mp5 tracks and shows album view", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([
      albumManifest,
      toneFixture,
      stemsFixture,
    ]);

    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("album-package-title")).toContainText("MP5 Demo Album");
    await expect(page.getByTestId("album-import-explainer")).toContainText("JSON package");
    await expect(page.getByTestId("album-import-explainer")).toContainText("not an embedded archive");
    await expect(page.getByTestId("album-resolved-count")).toContainText("2 found");
    await expect(page.getByTestId("album-found-files")).toBeVisible();
    await expect(page.getByTestId("album-track-row")).toHaveCount(2);
    await expect(page.getByTestId("album-track-row[data-missing='true']")).toHaveCount(0);
  });

  test("play album loads queue", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([
      albumManifest,
      toneFixture,
      stemsFixture,
    ]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("album-play-all").click();
    await expect(page.getByTestId("playlist-list")).toBeVisible();
    await expect(page.getByTestId("playlist-item")).toHaveCount(2, { timeout: 10_000 });
  });

  test("create album manifest from playlist", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([toneFixture, stemsFixture]);
    await expect(page.getByTestId("create-album-package-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("create-album-archive-warning")).toBeVisible();
    await expect(page.getByTestId("create-album-track-order")).toBeVisible();
    await expect(page.getByTestId("create-album-export")).toBeEnabled();
  });

  test("single mp5 drop without manifest still works", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([toneFixture]);
    await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("album-package-panel")).toHaveCount(0);
  });
});
