import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const embeddedFixture = path.join(
  process.cwd(),
  "test-fixtures/demo_embedded_album_package.mp5p",
);
const hasEmbedded = fs.existsSync(embeddedFixture);

test.describe("embedded album package (.mp5p)", () => {
  test.skip(!hasEmbedded, "run pnpm fixtures:embedded-album");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
  });

  test("imports embedded package without sidecars", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("album-package-type")).toContainText("Embedded");
    await expect(page.getByTestId("album-import-explainer")).toContainText("Embedded album package");
    await expect(page.getByTestId("album-resolved-count")).toContainText("embedded");
    await expect(page.getByTestId("album-track-row")).toHaveCount(2);
  });

  test("play album loads embedded tracks", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("album-play-all").click();
    await expect(page.getByTestId("playlist-item")).toHaveCount(2, { timeout: 20_000 });
  });
});
