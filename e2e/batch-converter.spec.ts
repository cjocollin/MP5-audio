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
    await expect(page.getByTestId("batch-converter-panel")).toContainText("MP5-L v3");
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
});
