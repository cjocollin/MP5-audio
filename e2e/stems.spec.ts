import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const stemFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");
const hasStemFixture = fs.existsSync(stemFixture);

test.describe("stem playback UI", () => {
  test.skip(!hasStemFixture, "run pnpm fixtures:generate to create demo_mp5l_v3_stems.mp5");

  test("loads stem demo, prepares selected stem, returns to full mix", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();

    const input = page.getByTestId("player-file-input");
    await input.setInputFiles(stemFixture);

    await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("stems-panel-help")).toBeVisible();
    await expect(page.getByTestId("stems-list").locator("[data-testid=stems-item]")).toHaveCount(4);
    await expect(page.getByTestId("stems-mix-blocked")).toHaveCount(0);

    const firstItem = page.getByTestId("stems-item").first();
    await firstItem.getByTestId("stems-item-select").check();
    await page.getByTestId("stems-prepare-selected").click();
    await expect(firstItem.getByTestId("stems-item-loaded")).toBeVisible({ timeout: 30_000 });

    await firstItem.getByTestId("stems-item-mute").click();
    await expect(firstItem.getByTestId("stems-item-mute")).toHaveClass(/red-300/);

    await page.getByTestId("stem-mix-stop").click();
    await expect(page.getByTestId("stems-mix-active-note")).toHaveCount(0);

    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("mp5-player")).toBeVisible();
    await expect(page.getByTestId("stems-decode-error")).toHaveCount(0);
  });

  test("solo loads one stem without preparing all", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(stemFixture);
    await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 15_000 });

    const first = page.getByTestId("stems-item").first();
    await first.getByTestId("stems-item-solo-load").click();
    await expect(first.getByTestId("stems-item-loaded")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("stems-item-loaded")).toHaveCount(1);
  });

  test("file without stems does not show stems panel", async ({ page }) => {
    const plain = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
    test.skip(!fs.existsSync(plain), "missing demo_mp5l_v3_tone.mp5");

    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(plain);
    await expect.poll(() => page.getByTestId("playlist-item").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("stems-panel")).toHaveCount(0);
  });
});
