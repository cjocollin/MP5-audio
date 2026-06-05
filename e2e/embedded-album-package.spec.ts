import { test, expect, devices } from "@playwright/test";
import path from "path";
import fs from "fs";

const embeddedFixture = path.join(
  process.cwd(),
  "test-fixtures/demo_embedded_album_package.mp5p",
);
const manifestFixture = path.join(process.cwd(), "test-fixtures/demo_album_package.mp5p");
const hasEmbedded = fs.existsSync(embeddedFixture);
const hasManifest = fs.existsSync(manifestFixture);

test.describe("embedded album package (.mp5p)", () => {
  test.skip(!hasEmbedded, "run pnpm fixtures:embedded-album");

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
  });

  test("imports embedded package with polished album header", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("album-package-type")).toContainText("Embedded");
    await expect(page.getByTestId("album-package-title")).toBeVisible();
    await expect(page.getByTestId("album-import-explainer")).toContainText("Embedded album package");
    await expect(page.getByTestId("album-resolved-count")).toContainText("embedded");
    await expect(page.getByTestId("album-track-row")).toHaveCount(2);
    await expect(page.getByTestId("album-integrity-status")).toBeVisible();
  });

  test("play selected embedded track", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("album-track-play").first().click();
    await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 20_000 });
  });

  test("play album loads first embedded track lazily", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("album-play-all").click();
    await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 20_000 });
  });

  test("extract track button is present for embedded rows", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("album-track-extract").first()).toBeVisible();
  });

  test("save album shows confirmation", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    page.once("dialog", (d) => d.accept());
    await page.getByTestId("album-save-to-library").click();
    await expect(page.getByTestId("album-save-note")).toBeVisible({ timeout: 10_000 });
  });

  test("mobile viewport album view is readable", async ({ browser }) => {
    const context = await browser.newContext({
      ...devices["iPhone 13"],
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles([embeddedFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    const panel = page.getByTestId("album-package-panel");
    const box = await panel.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(430);
    await expect(page.getByTestId("album-play-all")).toBeVisible();
    await context.close();
  });
});

test.describe("manifest album package UX", () => {
  test.skip(!hasManifest, "run pnpm fixtures:generate");

  test("shows sidecar messaging for manifest package", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles([manifestFixture]);
    await expect(page.getByTestId("album-package-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("album-package-type")).toContainText("Manifest");
    await expect(page.getByTestId("album-import-explainer")).toContainText("Manifest album package");
  });
});
