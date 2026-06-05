import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import {
  parseDisplayedPlaybackTime,
  waitForPlaybackProgress,
  waitForSeekReady,
} from "./helpers/playbackTime";
import { dismissWelcomeOnboarding } from "./helpers/onboarding";

const pityClassFixture = path.join(
  process.cwd(),
  "test-fixtures/demo_pity_party_class.mp5",
);
const hasFixture = fs.existsSync(pityClassFixture);

function parseTime(s: string | null): number {
  return parseDisplayedPlaybackTime(s);
}

async function clickPlayAndWait(page: import("@playwright/test").Page): Promise<void> {
  const play = page.getByTestId("play-pause");
  await expect(play).toBeEnabled({ timeout: 90_000 });
  await play.click();
  const status = page.getByTestId("player-playback-status");
  try {
    await expect(status).toContainText("Playing", { timeout: 8_000 });
  } catch {
    await play.click();
    await expect(status).toContainText("Playing", { timeout: 25_000 });
  }
}

async function loadPityClass(
  page: import("@playwright/test").Page,
  opts?: { requireStems?: boolean },
) {
  await dismissWelcomeOnboarding(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Player", exact: true }).click();
  await expect(page.getByTestId("player-file-input")).toBeAttached({ timeout: 30_000 });
  await page.getByTestId("player-file-input").setInputFiles(pityClassFixture);
  await expect
    .poll(
      async () => {
        const items = await page.getByTestId("playlist-item").count();
        if (items > 0) return "loaded";
        if ((await page.getByTestId("player-load-error").count()) > 0) return "error";
        return "pending";
      },
      { timeout: 180_000 },
    )
    .toBe("loaded");
  await waitForSeekReady(page);
  await expect
    .poll(async () => Number(await page.getByTestId("seek-slider").getAttribute("max")), {
      timeout: 90_000,
    })
    .toBeGreaterThan(5);
  if (opts?.requireStems !== false) {
    await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("stems-list").locator("[data-testid=stems-item]")).toHaveCount(
      10,
      { timeout: 30_000 },
    );
  }
}

async function seekToStart(page: import("@playwright/test").Page): Promise<void> {
  const seek = page.getByTestId("seek-slider");
  await seek.fill("0");
  await expect(seek).toHaveValue("0", { timeout: 5_000 });
}

test.describe("playback regression — pity party class", () => {
  test.describe.configure({ timeout: 180_000 });

  test.skip(!hasFixture, "run pnpm fixtures:pity-party-class");

  test("A. full mix: Play advances time and status is Playing", async ({ page }) => {
    await loadPityClass(page, { requireStems: false });
    await seekToStart(page);
    await clickPlayAndWait(page);
    await waitForPlaybackProgress(page, 0.05, 30_000);
    const t = parseTime(await page.getByTestId("current-time").textContent());
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(15);
  });

  test("B. waveform seek changes time and playback continues", async ({ page }) => {
    await loadPityClass(page);
    await seekToStart(page);
    await expect(page.getByTestId("play-pause")).toBeEnabled({ timeout: 90_000 });
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause", {
      timeout: 15_000,
    });
    await page.waitForTimeout(600);
    const beforeSeek = parseTime(await page.getByTestId("current-time").textContent());

    const waveform = page.getByTestId("waveform");
    await expect(waveform).toBeVisible();
    const box = await waveform.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(
      box!.x + box!.width * 0.55,
      box!.y + box!.height / 2,
    );

    let peakSeek = beforeSeek;
    await expect
      .poll(async () => {
        peakSeek = Math.max(
          peakSeek,
          parseTime(await page.getByTestId("current-time").textContent()),
        );
        return peakSeek;
      }, { timeout: 8_000 })
      .toBeGreaterThan(beforeSeek);
    expect(peakSeek).toBeLessThanOrEqual(12);
  });

  test("C. karaoke: Play without waveform advances progress", async ({ page }) => {
    await loadPityClass(page);
    await expect(page.getByTestId("lyrics-panel")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("karaoke-mode-toggle").click();
    await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({
      timeout: 90_000,
    });
    await seekToStart(page);

    await clickPlayAndWait(page);
    await waitForPlaybackProgress(page, 0.05, 30_000);
    const t = parseTime(await page.getByTestId("current-time").textContent());
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(15);
  });

  test("D. stem mix: toggles do not reset playhead; no overlap", async ({ page }) => {
    await loadPityClass(page);
    const items = page.getByTestId("stems-item");
    await expect(items).toHaveCount(10);

    await items.nth(0).getByTestId("stems-item-select").check();
    await items.nth(1).getByTestId("stems-item-select").check();
    await expect(page.getByTestId("stems-prepare-selected")).toBeEnabled({ timeout: 90_000 });
    await page.getByTestId("stems-prepare-selected").click();
    await expect(items.nth(0).getByTestId("stems-item-loaded")).toBeVisible({
      timeout: 90_000,
    });
    await expect(items.nth(1).getByTestId("stems-item-loaded")).toBeVisible({
      timeout: 90_000,
    });

    await expect(page.getByTestId("play-pause")).toBeEnabled({ timeout: 90_000 });
    await page.getByTestId("play-pause").click();
    await page.getByTestId("stems-enable-mix").click();
    await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({ timeout: 15_000 });

    await page.waitForTimeout(500);
    const before = parseTime(await page.getByTestId("current-time").textContent());

    await items.nth(1).getByTestId("stems-item-select").uncheck();
    await page.waitForTimeout(100);
    await items.nth(1).getByTestId("stems-item-select").check();
    await page.waitForTimeout(100);
    await items.nth(0).getByTestId("stems-item-mute").click();
    await page.waitForTimeout(100);
    await items.nth(0).getByTestId("stems-item-mute").click();
    await page.waitForTimeout(200);

    const after = parseTime(await page.getByTestId("current-time").textContent());
    expect(after).toBeGreaterThanOrEqual(Math.max(0, before - 1));

    const diag = page.getByTestId("stems-transport-diagnostics");
    await expect(diag).not.toContainText("OVERLAP");
  });

  test("E. late Lead Vocal join keeps transport playing without overlap", async ({ page }) => {
    await loadPityClass(page);
    await page.getByTestId("karaoke-mode-toggle").click();
    await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.getByTestId("play-pause")).toBeEnabled({ timeout: 90_000 });
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("player-playback-status")).toContainText("Playing", {
      timeout: 20_000,
    });

    await waitForPlaybackProgress(page, 0.05, 15_000);
    const beforeJoin = parseTime(await page.getByTestId("current-time").textContent());
    expect(beforeJoin).toBeGreaterThanOrEqual(0);

    const leadItem = page
      .getByTestId("stems-item")
      .filter({ has: page.getByTestId("stems-item-name").filter({ hasText: "Lead Vocal" }) });
    await leadItem.getByTestId("stems-item-select").check();
    await expect(leadItem.getByTestId("stems-item-loaded")).toBeVisible({ timeout: 90_000 });
    await leadItem.getByTestId("stems-item-mute").click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId("stems-transport-diagnostics")).not.toContainText("OVERLAP");

    const snap = await page.evaluate(() => {
      const fn = (
        window as Window & {
          __mp5PlaybackRegression?: () => {
            activeStemIds: string[];
            overlapDetected: boolean;
            playState: string;
          } | null;
        }
      ).__mp5PlaybackRegression;
      return fn?.() ?? null;
    });
    if (snap) {
      expect(snap.overlapDetected).toBe(false);
    }
  });

  test("F. scroll: window scrollY does not jump upward during lyrics updates", async ({ page }) => {
    test.setTimeout(240_000);
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

    await loadPityClass(page);
    await page.evaluate(() => window.scrollTo(0, 900));
    const scrollY0 = await page.evaluate(() => window.scrollY);
    expect(scrollY0).toBeGreaterThan(400);

    await page.getByTestId("play-pause").click();
    await page.waitForTimeout(2500);

    const scrollY1 = await page.evaluate(() => window.scrollY);
    expect(scrollY1).toBeGreaterThanOrEqual(scrollY0 - 20);

    const badScrolls = await page.evaluate(
      () => (window as unknown as { __badScrollIntoView: number }).__badScrollIntoView,
    );
    expect(badScrolls).toBe(0);
  });
});
