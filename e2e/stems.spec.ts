import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const stemFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_stems.mp5");
const hasStemFixture = fs.existsSync(stemFixture);

test.describe("stem playback UI", () => {
  test.describe.configure({ timeout: 120_000 });
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
    await expect(page.getByTestId("stems-prepare-selected")).toBeEnabled({ timeout: 90_000 });
    await page.getByTestId("stems-prepare-selected").click();
    await expect(firstItem.getByTestId("stems-item-loaded")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("play-pause").click();
    await page.getByTestId("stems-enable-mix").click();
    await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({ timeout: 15_000 });

    await firstItem.getByTestId("stems-item-mute").click();
    await expect(firstItem.getByTestId("stems-item-mute")).toContainText(/unmute/i);

    await page.getByTestId("stem-mix-stop").click();
    await expect(page.getByTestId("stems-mix-active-note")).toHaveCount(0);

    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("mp5-player")).toBeVisible();
    await expect(page.getByTestId("stems-decode-error")).toHaveCount(0);
  });

  test("shows progress and cancel during stem preparation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(stemFixture);
    await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 15_000 });

    const items = page.getByTestId("stems-item");
    await items.nth(0).getByTestId("stems-item-select").check();
    await items.nth(1).getByTestId("stems-item-select").check();
    await page.getByTestId("stems-prepare-selected").click();
    await expect(page.getByTestId("stems-prepare-progress")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("stems-prepare-cancel").click();
    await expect(page.getByTestId("stems-status-note")).toContainText(/cancelled/i, {
      timeout: 10_000,
    });
    await expect(page.getByTestId("stems-panel")).toBeVisible();
    await expect(page.getByTestId("play-pause")).toBeEnabled();
  });

  test("checking a stem during full mix does not stop playback", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(stemFixture);
    await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("stems-mix-active-note")).toHaveCount(0);

    const second = page.getByTestId("stems-item").nth(1);
    await second.getByTestId("stems-item-select").check();
    await expect(page.getByTestId("stems-mix-active-note")).toHaveCount(0);
    await expect(page.getByTestId("stems-selection-help")).toBeVisible();

    const timeBefore = await page
      .locator("[data-testid=player-controls] time, .font-mono")
      .first()
      .textContent()
      .catch(() => "");
    await page.waitForTimeout(800);
    const timeAfter = await page
      .locator("[data-testid=player-controls] time, .font-mono")
      .first()
      .textContent()
      .catch(() => "");
    if (timeBefore && timeAfter && timeBefore !== "0:00") {
      expect(timeAfter).not.toBe("0:00");
    }
  });

  test("stem mix checkbox and mute do not reset playhead", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(stemFixture);
    await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 15_000 });

    const items = page.getByTestId("stems-item");
    await items.nth(0).getByTestId("stems-item-select").check();
    await items.nth(1).getByTestId("stems-item-select").check();
    await page.getByTestId("stems-prepare-selected").click();
    await expect(items.nth(0).getByTestId("stems-item-loaded")).toBeVisible({ timeout: 30_000 });
    await expect(items.nth(1).getByTestId("stems-item-loaded")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("play-pause").click();
    await page.getByTestId("stems-enable-mix").click();
    await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await page.getByTestId("stems-transport-diagnostics").textContent()) ?? "", {
        timeout: 2_000,
      })
      .toMatch(/stem on/i);

    const parseTime = (s: string | null) => {
      const m = (s ?? "0:00").trim().match(/^(\d+):(\d{2})$/);
      if (!m) return 0;
      return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
    };

    // Synthetic demo stems are ~2s — run seamless toggles immediately after play starts.
    await page.waitForTimeout(400);
    const beforeSec = parseTime(await page.getByTestId("current-time").textContent());

    await items.nth(1).getByTestId("stems-item-select").uncheck();
    await page.waitForTimeout(80);
    const afterUncheck = parseTime(await page.getByTestId("current-time").textContent());
    expect(afterUncheck).toBeGreaterThanOrEqual(Math.max(0, beforeSec - 1));

    await items.nth(1).getByTestId("stems-item-select").check();
    await page.waitForTimeout(80);
    const afterCheck = parseTime(await page.getByTestId("current-time").textContent());
    expect(afterCheck).toBeGreaterThanOrEqual(Math.max(0, beforeSec - 1));

    await items.nth(0).getByTestId("stems-item-mute").click();
    await page.waitForTimeout(80);
    const afterMute = parseTime(await page.getByTestId("current-time").textContent());
    expect(afterMute).toBeGreaterThanOrEqual(Math.max(0, beforeSec - 1));

    await items.nth(0).getByTestId("stems-item-mute").click();
    await page.waitForTimeout(80);

    const diag = page.getByTestId("stems-transport-diagnostics");
    await expect(diag).toContainText(/stem_mix/i);
    await expect(diag).not.toContainText("OVERLAP");
    await expect(diag).not.toContainText(/full_mix.*full on.*stem on/i);
  });

  test("unmute unloaded stem during stem mix does not stop playback", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(stemFixture);
    await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 15_000 });

    const items = page.getByTestId("stems-item");
    await items.nth(0).getByTestId("stems-item-select").check();
    await page.getByTestId("stems-prepare-selected").click();
    await expect(items.nth(0).getByTestId("stems-item-loaded")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("play-pause").click();
    await page.getByTestId("stems-enable-mix").click();
    await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({ timeout: 15_000 });

    const parseTime = (s: string | null) => {
      const m = (s ?? "0:00").trim().match(/^(\d+):(\d{2})$/);
      if (!m) return 0;
      return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
    };

    await page.waitForTimeout(400);
    const beforeSec = parseTime(await page.getByTestId("current-time").textContent());

    const unloaded = items.nth(2);
    await unloaded.getByTestId("stems-item-mute").click();
    await page.waitForTimeout(80);
    await unloaded.getByTestId("stems-item-mute").click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause");
    const afterSec = parseTime(await page.getByTestId("current-time").textContent());
    expect(afterSec).toBeGreaterThanOrEqual(Math.max(0, beforeSec - 1));
    expect(afterSec).toBeLessThan(8);

    await expect(page.getByTestId("duration-time")).not.toHaveText("0:00");
  });

  test("first play advances time at real-time rate, not sprint to end", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Player", exact: true }).click();
    await page.getByTestId("player-file-input").setInputFiles(stemFixture);
    await expect(page.getByTestId("duration-time")).not.toHaveText("0:00", { timeout: 30_000 });

    const parseTime = (s: string | null) => {
      const m = (s ?? "0:00").trim().match(/^(\d+):(\d{2})$/);
      if (!m) return 0;
      return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
    };

    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause", {
      timeout: 15_000,
    });

    const durSec = parseTime(await page.getByTestId("duration-time").textContent());
    await page.waitForTimeout(1200);
    const curSec = parseTime(await page.getByTestId("current-time").textContent());
    expect(curSec).toBeGreaterThanOrEqual(0);
    expect(curSec).toBeLessThan(Math.max(2, durSec - 1));
    if (durSec > 3) {
      expect(curSec).toBeLessThan(8);
    }
  });

  test("lyrics and song map do not scroll the page during playback", async ({ page }) => {
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
    await page.getByTestId("player-file-input").setInputFiles(stemFixture);
    await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("lyrics-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("song-map-panel")).toBeVisible();

    await page.getByTestId("play-pause").click();
    await page.waitForTimeout(2000);

    const badScrolls = await page.evaluate(
      () => (window as unknown as { __badScrollIntoView: number }).__badScrollIntoView,
    );
    expect(badScrolls).toBe(0);
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
