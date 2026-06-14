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
    await expect(page.getByTestId("library-section-tracks")).toBeVisible();
    await expect(page.getByTestId("library-storage-stats")).toBeVisible();

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

  test("filter and sort controls are present", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Library" }).click();
    await expect(page.getByTestId("library-kind-filter")).toBeVisible();
    await expect(page.getByTestId("library-sort")).toBeVisible();
    await page.getByTestId("library-kind-filter").selectOption("tracks");
    await page.getByTestId("library-sort").selectOption("title-asc");
  });

  test("delete confirmation appears for saved track", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Library" }).click();
    await page.getByTestId("local-library-file-input").setInputFiles(fixture);
    await expect(page.getByTestId("local-library-item")).toHaveCount(1, { timeout: 15_000 });

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toMatch(/browser-local saved copy/i);
      dialog.dismiss();
    });
    await page.getByTestId("local-library-delete").click();
  });

  test("mobile library layout is usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Library" }).click();
    await expect(page.getByTestId("local-library-panel")).toBeVisible();
    await expect(page.getByTestId("local-library-search")).toBeVisible();
    await expect(page.getByTestId("library-kind-filter")).toBeVisible();
  });
});
