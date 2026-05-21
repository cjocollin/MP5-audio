import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const toneFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
const hasFixture = fs.existsSync(toneFixture);

test.describe("fingerprint / integrity", () => {
  test.skip(!hasFixture, "run pnpm fixtures:generate");

  test("metadata panel shows integrity section", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles([toneFixture]);
    await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("metadata-integrity-panel")).toBeVisible();
    await expect(page.getByTestId("integrity-disclaimer")).toContainText("not DRM");
    await page.getByTestId("playlist-item-play").click();
    await expect(page.getByTestId("now-playing")).toBeVisible({ timeout: 10_000 });
  });
});
