import { test, expect } from "@playwright/test";

test.describe("public landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("compact hero renders and app tabs are reachable without expanding About", async ({ page }) => {
    await expect(page.getByTestId("landing-hero-compact")).toBeVisible();
    await expect(page.getByTestId("landing-headline")).toHaveText("MP5 Audio");
    await expect(page.getByTestId("landing-subheadline")).toBeVisible();
    await expect(page.getByTestId("landing-badges")).toBeVisible();
    await expect(page.getByTestId("landing-primary-actions")).toBeVisible();
    await expect(page.getByTestId("app-main-nav")).toBeVisible();
    await expect(page.getByRole("button", { name: "Player", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Converter", exact: true })).toBeVisible();

    await expect(page.getByTestId("landing-about-details")).toHaveCount(0);
    await expect(page.getByTestId("landing-codec-mp5l")).toHaveCount(0);
  });

  test("expanding About MP5 shows detailed sections and screenshot gallery", async ({ page }) => {
    await page.getByTestId("landing-about-toggle").click();
    await expect(page.getByTestId("landing-about-details")).toBeVisible();
    await expect(page.getByTestId("landing-codec-mp5l")).toContainText("MP5-L");
    await expect(page.getByTestId("landing-codec-mp5c")).toContainText("hiss");
    await expect(page.getByTestId("landing-honesty-claim")).not.toContainText(/beats MP3/i);
    await expect(page.getByTestId("landing-screenshot-scroll")).toBeVisible();
    await expect(page.getByTestId("landing-screenshot-player")).toBeVisible();
  });

  test("primary actions navigate tabs and GitHub link works", async ({ page }) => {
    await expect(page.getByTestId("landing-github-link")).toHaveAttribute(
      "href",
      /github\.com\/cjocollin\/MP5-audio/,
    );
    await page.getByTestId("landing-open-converter").click();
    await expect(page.getByTestId("converter-panel")).toBeVisible();
    await page.getByTestId("landing-open-player").click();
    await expect(page.getByTestId("player-file-input")).toBeAttached();
  });

  test("Try MP5-L demo opens player without requiring About expansion", async ({ page }) => {
    await page.getByTestId("landing-try-demo").click();
    await expect(page.getByRole("button", { name: "Player", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("player-file-input")).toBeAttached();
  });
});
