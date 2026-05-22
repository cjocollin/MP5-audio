import { test, expect } from "@playwright/test";

const STEM_DEMO = "/test-fixtures/demo_mp5l_v3_stems.mp5";

test.describe("visual theme (VISU)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
  });

  test("applies file theme on karaoke demo", async ({ page }) => {
    await page.getByTestId("player-load-stems-demo").click();
    await expect(page.getByTestId("player-theme-root")).toHaveAttribute("data-theme-active", "true");
    await expect(page.getByTestId("now-playing-theme-badge")).toContainText("Calm demo");
    await expect(page.getByTestId("metadata-visual-theme-panel")).toContainText("Calm demo");
    await expect(page.getByTestId("visu-color-swatches")).toBeVisible();
    await expect(page.getByTestId("visu-theme-status")).toContainText("File theme applied: yes");
    await expect(page.getByTestId("player-theme-root")).toHaveCSS("border-color", /./);
  });

  test("disabling file themes hides VISU styling", async ({ page }) => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByTestId("use-file-themes-setting").locator("input").uncheck();
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-load-stems-demo").click();
    await expect(page.getByTestId("player-theme-root")).toHaveAttribute("data-theme-active", "false");
    await expect(page.getByTestId("now-playing-theme-badge")).toHaveCount(0);
  });
});
