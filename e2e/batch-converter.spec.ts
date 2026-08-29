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

  test("single mode offers MP5-L v4, MP5-C v6 + PCM until lab codecs are shown", async ({
    page,
  }) => {
    await page.getByTestId("converter-mode-single").click();
    const select = page.getByTestId("codec-select");
    await expect(select).toHaveValue("mp5l_v4");

    // Public surface: MP5-L v4 (recommended), MP5-C v6 (beta preview), and PCM (debug).
    await expect(select.locator("option")).toHaveCount(3);
    await expect(select.locator('option[value="mp5l_v4"]')).toHaveCount(1);
    await expect(select.locator('option[value="mp5c6"]')).toHaveCount(1);
    await expect(select.locator('option[value="pcm"]')).toHaveCount(1);
    for (const lab of ["mp5l", "mp5c", "mp5c2", "mp5h"]) {
      await expect(select.locator(`option[value="${lab}"]`)).toHaveCount(0);
    }

    await page.getByTestId("converter-advanced-formats-toggle").click();
    await page.getByTestId("lab-codecs-toggle").click();
    for (const lab of ["mp5l", "mp5c", "mp5c2", "mp5h"]) {
      await expect(select.locator(`option[value="${lab}"]`)).toHaveCount(1);
    }

    await select.selectOption("mp5c2");
    await expect(page.getByTestId("mp5c2-info")).toBeVisible();
    await select.selectOption("mp5c");
    await expect(page.getByTestId("mp5c-hiss-warning")).toBeVisible();
  });

  test("closing the lab toggle falls back to MP5-L v4", async ({ page }) => {
    await page.getByTestId("converter-mode-single").click();
    const select = page.getByTestId("codec-select");
    const toggle = page.getByTestId("lab-codecs-toggle");

    await page.getByTestId("converter-advanced-formats-toggle").click();
    await toggle.click();
    await select.selectOption("mp5h");
    await expect(select).toHaveValue("mp5h");

    await toggle.click();
    await expect(select).toHaveValue("mp5l_v4");
  });
});
