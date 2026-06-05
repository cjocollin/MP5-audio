import { test, expect } from "@playwright/test";

const hostedUrl = process.env.MP5_HOSTED_URL;
test.skip(!hostedUrl, "Set MP5_HOSTED_URL to the deployed HTTPS origin");

/**
 * Hosted HTTPS demo validation — run with:
 * MP5_HOSTED_URL=https://your-app.vercel.app pnpm test:e2e:hosted
 */
test.describe("MP5 hosted demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("landing-headline")).toHaveText("MP5 Audio");
    await expect(page.getByTestId("app-version")).toContainText("MP5 Alpha");
    await expect(page.getByTestId("app-version")).toContainText("v0.15.2-alpha");
  });

  test("app shell and honest tagline", async ({ page }) => {
    await page.getByTestId("landing-about-toggle").click();
    await expect(page.getByTestId("landing-honesty-claim")).toContainText(
      "does not claim to beat MP3",
    );
    await expect(page.getByTestId("landing-demo-url")).toContainText("mp5-audio.vercel.app");
  });

  test("loads demo fixture and shows MP5-L v3 format panel", async ({ page }) => {
    await page.getByTestId("landing-try-demo").click({ timeout: 15_000 });
    await expect
      .poll(async () => page.getByTestId("seek-slider").getAttribute("max"), {
        timeout: 30_000,
      })
      .not.toBe("0");
    await expect(page.getByText(/MP5-L/i).first()).toBeVisible();
  });

  test("converter tab loads", async ({ page }) => {
    await page.getByRole("button", { name: "Converter", exact: true }).click();
    await expect(page.getByTestId("converter-panel")).toBeVisible();
  });
});
