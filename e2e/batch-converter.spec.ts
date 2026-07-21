import path from "node:path";
import fs from "node:fs";
import { test, expect } from "@playwright/test";

const wavFixture = path.join(process.cwd(), "test-fixtures/compatibility/wav_mono_44k_short.wav");
const hasWavFixture = fs.existsSync(wavFixture);

test.describe("Batch converter", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Converter", exact: true }).click();
    await expect(page.getByTestId("converter-panel")).toBeVisible();
    await page.getByTestId("converter-mode-batch").click();
    await expect(page.getByTestId("batch-converter-panel")).toBeVisible();
  });

  test("shows batch honesty and MP5-L default", async ({ page }) => {
    await expect(page.getByTestId("batch-honesty-warning")).toContainText("never upload");
    await expect(page.getByTestId("batch-converter-panel")).toContainText("MP5-L v4");
  });

  test("queues supported files and shows progress summary", async ({ page }) => {
    test.skip(!hasWavFixture, "run pnpm e2e:fixtures or pnpm compatibility:fixtures");
    await page.getByTestId("batch-file-input").setInputFiles([wavFixture, wavFixture]);
    await expect(page.getByTestId("batch-progress-summary")).toContainText("Total:");
    await expect(page.getByTestId("batch-queue-list").locator("li")).toHaveCount(1);
  });

  test("batch album mode shows metadata builder", async ({ page }) => {
    await page.getByTestId("batch-album-mode-toggle").locator("input").check();
    await expect(page.getByTestId("batch-album-builder")).toBeVisible();
    await expect(page.getByTestId("batch-album-export-target")).toBeVisible();
  });

  test("single-file mode still available", async ({ page }) => {
    await page.getByTestId("converter-mode-single").click();
    await expect(page.getByTestId("converter-file-input")).toBeAttached();
    await expect(page.getByTestId("converter-export-help")).toBeVisible();
    await expect(page.getByTestId("batch-converter-panel")).toHaveCount(0);
  });

  test("single mode defaults to MP5-L; MP5-C2 open; classic MP5-C lab-gated", async ({ page }) => {
    await page.getByTestId("converter-mode-single").click();
    const select = page.getByTestId("codec-select");
    await expect(select).toHaveValue("mp5l_v4");
    await expect(select.locator('option[value="mp5c"]')).toHaveCount(0);
    await expect(select.locator('option[value="mp5l"]')).toHaveCount(0);
    await expect(select.locator('option[value="mp5c2"]')).toHaveCount(1);
    await select.selectOption("mp5c2");
    await expect(page.getByTestId("mp5c2-info")).toBeVisible();
    await page.getByTestId("lab-codecs-toggle").click();
    await expect(select.locator('option[value="mp5c"]')).toHaveCount(1);
    await expect(select.locator('option[value="mp5l"]')).toHaveCount(1);
    await select.selectOption("mp5c");
    await expect(page.getByTestId("mp5c-hiss-warning")).toBeVisible();
  });
});
