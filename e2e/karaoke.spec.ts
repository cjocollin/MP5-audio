import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const karaokeFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");
const hasFixture = fs.existsSync(karaokeFixture);

test.describe("karaoke / synced lyrics UI", () => {
  test.skip(!hasFixture, "run pnpm fixtures:generate for demo_mp5l_v3_stems.mp5");

  test("shows synced lyrics and karaoke mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();

    await page.getByTestId("player-file-input").setInputFiles(karaokeFixture);

    await expect(page.getByTestId("lyrics-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("lyrics-sync-indicator")).toContainText("Synced");
    await expect(page.getByTestId("lyrics-karaoke-availability")).toContainText(
      /available|instrumental/i,
    );
    await expect(page.getByTestId("lyrics-synced-line")).toHaveCount(5);

    await page.getByTestId("karaoke-mode-toggle").click();
    await expect(page.getByTestId("karaoke-mode-toggle")).toContainText("on");
    await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({
      timeout: 30_000,
    });

    const parseTime = (s: string | null) => {
      const m = (s ?? "0:00").trim().match(/^(\d+):(\d{2})$/);
      if (!m) return 0;
      return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
    };

    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause", {
      timeout: 10_000,
    });

    await page.waitForTimeout(1200);
    const afterPlay = parseTime(await page.getByTestId("current-time").textContent());
    expect(afterPlay).toBeGreaterThanOrEqual(0);
    expect(afterPlay).toBeLessThan(8);

    await page.getByTestId("seek-slider").click({ position: { x: 40, y: 5 } });
    await page.waitForTimeout(400);
    const afterSeek = parseTime(await page.getByTestId("current-time").textContent());
    expect(afterSeek).toBeGreaterThanOrEqual(0);
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause");
  });

  test("karaoke play does not require waveform click and scroll does not regress", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const orig = Element.prototype.scrollIntoView;
      (window as unknown as { __badScrollIntoView: number }).__badScrollIntoView = 0;
      Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
        const el = this as HTMLElement;
        const inPanel =
          el.closest('[data-testid="lyrics-synced-view"]') ||
          el.closest('[data-testid="song-map-list"]');
        if (!inPanel) {
          (window as unknown as { __badScrollIntoView: number }).__badScrollIntoView += 1;
          return;
        }
        return orig.apply(this, args as [ScrollIntoViewOptions?]);
      };
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(karaokeFixture);
    await expect(page.getByTestId("lyrics-panel")).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => window.scrollTo(0, 800));
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await page.getByTestId("karaoke-mode-toggle").click();
    await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause", {
      timeout: 10_000,
    });
    await page.waitForTimeout(2000);

    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeGreaterThanOrEqual(scrollBefore - 20);

    const badScrolls = await page.evaluate(
      () => (window as unknown as { __badScrollIntoView: number }).__badScrollIntoView,
    );
    expect(badScrolls).toBe(0);
  });

  test("plain demo has no synced lyrics panel content", async ({ page }) => {
    const plain = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
    test.skip(!fs.existsSync(plain), "missing demo_mp5l_v3_tone.mp5");

    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(plain);
    await expect.poll(() => page.getByTestId("playlist-item").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("lyrics-empty")).toBeVisible();
    await expect(page.getByTestId("karaoke-mode-toggle")).toHaveCount(0);
  });
});
