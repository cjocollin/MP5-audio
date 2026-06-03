import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const MOBILE = { width: 390, height: 844 };
const STEM_DEMO = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");
const COVER_FIXTURE = path.join(
  process.cwd(),
  "test-fixtures/compatibility/mp5l_with_cover.mp5",
);

async function assertNoGlobalCoverBackground(page: import("@playwright/test").Page) {
  const bgChecks = await page.evaluate(() => {
    const targets = [document.body, document.documentElement];
    const appRoot = document.querySelector(".min-h-screen.max-w-5xl");
    if (appRoot) targets.push(appRoot);
    return targets.map((el) => {
      const style = getComputedStyle(el!);
      return {
        tag: el!.tagName.toLowerCase(),
        backgroundImage: style.backgroundImage,
      };
    });
  });
  for (const check of bgChecks) {
    expect(check.backgroundImage, `${check.tag} background`).toMatch(/none|^$/);
  }
}

async function assertCoverContainedInCard(page: import("@playwright/test").Page) {
  const cover = page.getByTestId("now-playing-cover");
  await expect(cover).toBeVisible({ timeout: 15_000 });
  const card = page.getByTestId("now-playing-theme-card");
  const coverBox = await cover.boundingBox();
  const cardBox = await card.boundingBox();
  expect(coverBox).toBeTruthy();
  expect(cardBox).toBeTruthy();
  if (!coverBox || !cardBox) return;
  expect(coverBox.width).toBeLessThanOrEqual(cardBox.width + 2);
  expect(coverBox.height).toBeLessThanOrEqual(cardBox.height + 2);
  expect(coverBox.x).toBeGreaterThanOrEqual(cardBox.x - 2);
  expect(coverBox.y).toBeGreaterThanOrEqual(cardBox.y - 2);
}

test.describe("VISU / cover mobile containment", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
  });

  test("VISU tints Now Playing only — no global wallpaper on mobile", async ({ page }) => {
    test.skip(!fs.existsSync(STEM_DEMO), "run pnpm fixtures:generate for demo_mp5l_v3_stems.mp5");

    await page.getByTestId("player-load-stems-demo").click();
    await expect(page.getByTestId("player-theme-root")).toHaveAttribute("data-theme-active", "true", {
      timeout: 15_000,
    });

    await assertNoGlobalCoverBackground(page);

    const themeRoot = page.getByTestId("player-theme-root");
    const nav = page.getByTestId("app-main-nav");
    const themeBox = await themeRoot.boundingBox();
    const navBox = await nav.boundingBox();
    const viewport = page.viewportSize();
    expect(themeBox).toBeTruthy();
    expect(navBox).toBeTruthy();
    if (!themeBox || !navBox || !viewport) return;

    expect(themeBox.y).toBeGreaterThanOrEqual(navBox.y);
    const themeBg = await themeRoot.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(themeBg).not.toMatch(/url\s*\(/i);
    await expect(nav).toBeVisible();
    const navBg = await nav.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(navBg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("cover art stays inside Now Playing card on mobile", async ({ page }) => {
    test.skip(!fs.existsSync(COVER_FIXTURE), "run pnpm compatibility:fixtures for mp5l_with_cover.mp5");

    await page.getByTestId("player-file-input").setInputFiles(COVER_FIXTURE);
    await expect(page.getByTestId("now-playing-cover")).toBeVisible({ timeout: 15_000 });

    await assertNoGlobalCoverBackground(page);
    await assertCoverContainedInCard(page);

    const cardBox = await page.getByTestId("now-playing-theme-card").boundingBox();
    const viewport = page.viewportSize();
    expect(cardBox).toBeTruthy();
    if (!cardBox || !viewport) return;
    expect(cardBox.width).toBeLessThanOrEqual(viewport.width * 0.55);
  });

  test("main tabs remain readable after loading themed track", async ({ page }) => {
    test.skip(!fs.existsSync(STEM_DEMO), "run pnpm fixtures:generate for demo_mp5l_v3_stems.mp5");

    await page.getByTestId("player-load-stems-demo").click();
    await expect(page.getByTestId("now-playing-theme-badge")).toContainText("Calm demo", {
      timeout: 15_000,
    });

    for (const tab of ["Converter", "Library", "About"]) {
      await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
    }

    const playerTab = page.getByRole("button", { name: "Player", exact: true });
    await expect(playerTab).toHaveCSS("background-color", /./);
  });
});
