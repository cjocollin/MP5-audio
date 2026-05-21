import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const demoFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");
const hasFixture = fs.existsSync(demoFixture);

test.describe("highlights and loop playback", () => {
  test.skip(!hasFixture, "run pnpm fixtures:generate");

  test("shows highlights panel and preview control", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(demoFixture);

    await expect(page.getByTestId("highlights-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("highlight-item")).toHaveCount(3);
    await expect(page.getByTestId("highlight-preview").first()).toBeVisible();

    await page.getByTestId("highlight-preview").first().click();
    await expect(page.getByTestId("active-playback-range")).toContainText("Preview");
  });

  test("loop hook and stop loop", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(demoFixture);

    await expect(page.getByTestId("nav-loop-hook")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("nav-loop-hook").click();
    await expect(page.getByTestId("active-playback-range")).toContainText("Looping");

    await page.getByTestId("stop-loop").click();
    await expect(page.getByTestId("active-playback-range")).toHaveCount(0);
  });

  test("waveform highlight and loop markers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(demoFixture);

    await expect(page.getByTestId("waveform-highlight-marker")).toHaveCount(3, {
      timeout: 15_000,
    });

    await page.getByTestId("nav-loop-hook").click();
    await expect(page.getByTestId("waveform-loop-range")).toHaveCount(1);
  });
});
