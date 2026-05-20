import { test, expect } from "@playwright/test";
import path from "path";

const fixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");

test.describe("local library", () => {
  test("saves fixture to library and plays from library", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Library" }).click();
    await expect(page.getByTestId("local-library-panel")).toBeVisible();
    await expect(page.getByTestId("local-library-empty")).toBeVisible();

    const input = page.getByTestId("local-library-file-input");
    await input.setInputFiles(fixture);
    await expect(page.getByTestId("local-library-status")).toContainText(/Saved/i, { timeout: 15_000 });
    await expect(page.getByTestId("local-library-item")).toHaveCount(1);

    await page.getByTestId("local-library-play").click();
    await page.locator("nav").getByRole("button", { name: "Player", exact: true }).click();
    await expect(page.getByTestId("mp5-player")).toBeVisible();
    await expect.poll(async () => {
      const items = page.getByTestId("playlist-item");
      return items.count();
    }).toBeGreaterThan(0);
  });

  test("search filters library items", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Library" }).click();
    const input = page.getByTestId("local-library-file-input");
    await input.setInputFiles(fixture);
    await expect(page.getByTestId("local-library-item")).toHaveCount(1, { timeout: 15_000 });

    await page.getByTestId("local-library-search").fill("zzz-no-match");
    await expect(page.getByTestId("local-library-no-matches")).toBeVisible();
  });
});
