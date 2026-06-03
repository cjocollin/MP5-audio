import { expect, type Page } from "@playwright/test";

/** Matches formatPlaybackTime — mm:ss or sub-second `0.42s` for short demos. */
export function parseDisplayedPlaybackTime(s: string | null): number {
  const raw = (s ?? "0:00").trim();
  const subSec = raw.match(/^(\d+(?:\.\d+)?)s$/i);
  if (subSec) return parseFloat(subSec[1]!);
  const m = raw.match(/^(\d+):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
}

export async function waitForSeekReady(page: Page): Promise<void> {
  const seek = page.getByTestId("seek-slider");
  await expect(seek).toBeEnabled({ timeout: 90_000 });
  await expect
    .poll(async () => Number(await seek.getAttribute("max")), { timeout: 90_000 })
    .toBeGreaterThan(0);
}

/** Poll seek slider + displayed time — short demo tracks use sub-second labels. */
export async function waitForPlaybackProgress(
  page: Page,
  minSeconds = 0.05,
  timeoutMs = 20_000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const seekVal = Number(await page.getByTestId("seek-slider").inputValue());
        if (Number.isFinite(seekVal) && seekVal > minSeconds) return seekVal;
        return parseDisplayedPlaybackTime(
          await page.getByTestId("current-time").textContent(),
        );
      },
      { timeout: timeoutMs },
    )
    .toBeGreaterThan(minSeconds);
}
