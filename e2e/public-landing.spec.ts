import { test, expect } from "@playwright/test";

test.describe("public landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hero and codec cards render", async ({ page }) => {
    await expect(page.getByTestId("landing-headline")).toHaveText("MP5 Audio");
    await expect(page.getByTestId("landing-subheadline")).toBeVisible();
    await expect(page.getByTestId("landing-codec-mp5l")).toContainText("MP5-L");
    await expect(page.getByTestId("landing-codec-mp5c")).toContainText("hiss");
    await expect(page.getByTestId("landing-honesty-claim")).not.toContainText(/beats MP3/i);
  });

  test("screenshot gallery renders", async ({ page }) => {
    await expect(page.getByTestId("landing-screenshots")).toBeVisible();
    await expect(page.getByTestId("landing-screenshot-player")).toBeVisible();
    await expect(page.getByTestId("landing-screenshot-converter")).toBeVisible();
    await expect(page.getByTestId("landing-screenshot-metadata")).toBeVisible();
  });

  test("primary actions navigate tabs", async ({ page }) => {
    await page.getByTestId("landing-open-converter").click();
    await expect(page.getByTestId("converter-panel")).toBeVisible();
    await page.getByTestId("landing-open-player").click();
    await expect(page.getByTestId("player-file-input")).toBeAttached();
  });
});
