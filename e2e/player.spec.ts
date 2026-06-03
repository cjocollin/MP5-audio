import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const pcmFixture = path.join(process.cwd(), "test-fixtures", "validation_pcm_slice.mp5");
const mp5lFixture = path.join(process.cwd(), "test-fixtures", "validation_mp5l_v3.mp5");
const origamiFixture = path.join(
  process.cwd(),
  "benchmarks/real-music/ORIGAMI_mp5l_v3_alpha.mp5",
);

test.describe("MP5 player playback", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("landing-headline")).toHaveText("MP5 Audio");
  });

  async function loadFixture(page: import("@playwright/test").Page, file = pcmFixture) {
    await page.getByTestId("player-file-input").setInputFiles(file);
    const seek = page.getByTestId("seek-slider");
    await expect
      .poll(async () => Number(await seek.getAttribute("max")), { timeout: 90_000 })
      .toBeGreaterThan(0);
    await expect(seek).toBeEnabled({ timeout: 90_000 });
    return seek;
  }

  test("shows public landing and codec helper on player tab", async ({ page }) => {
    await expect(page.getByTestId("public-landing")).toBeVisible();
    await expect(page.getByTestId("landing-github-link")).toHaveAttribute(
      "href",
      "https://github.com/cjocollin/MP5-audio",
    );
    await page.getByTestId("landing-open-player").click();
    await expect(page.getByTestId("codec-modes-helper")).toBeVisible();
  });

  test("loads demo fixture from fixtures URL when available", async ({ page }) => {
    const demoPath = path.join(process.cwd(), "test-fixtures", "demo_mp5l_v3_tone.mp5");
    test.skip(!fs.existsSync(demoPath), "run pnpm fixtures:generate first");
    await page.getByTestId("landing-try-demo").click();
    await expect
      .poll(async () => page.getByTestId("playlist-item").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(page.getByTestId("codec-label")).toContainText(/MP5-L/i);
  });

  test("loads fixture and toggles play/pause", async ({ page }) => {
    await loadFixture(page);
    const play = page.getByTestId("play-pause");
    await play.click();
    await expect(play).toHaveAttribute("aria-label", "Pause");
    await play.click();
    await expect(play).toHaveAttribute("aria-label", "Play");
  });

  test("volume slider updates", async ({ page }) => {
    await loadFixture(page);

    const volume = page.getByTestId("volume-slider");
    await volume.evaluate((el: HTMLInputElement) => {
      el.value = "0.25";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(volume).toHaveValue("0.25");
  });

  test("seek changes current time", async ({ page }) => {
    const seek = await loadFixture(page, mp5lFixture);
    const target = 0.5;
    await seek.fill(String(target));
    await expect(seek).toHaveValue(String(target), { timeout: 15_000 });
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause");
  });

  test("loads MP5-L v3 fixture and shows format panel", async ({ page }) => {
    await loadFixture(page, mp5lFixture);
    await expect(page.getByTestId("codec-label")).toContainText(/MP5-L/i);
    await expect(page.getByTestId("mp5l-playback-detail")).toBeVisible();
    await expect(page.getByTestId("decode-path")).toContainText(/MP5-L WASM v3/i);
    await expect(page.getByTestId("player-load-error")).toHaveCount(0);
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause");
  });

  test("builds playlist from multiple fixtures", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([pcmFixture, mp5lFixture]);
    await expect(page.getByTestId("playlist-item")).toHaveCount(2);
    await expect(page.getByTestId("library-empty")).toHaveCount(0);
  });

  test("search filters playlist", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([pcmFixture, mp5lFixture]);
    await expect(page.getByTestId("playlist-item")).toHaveCount(2);
    await page.getByTestId("library-search").fill("validation_mp5l");
    await expect(page.getByTestId("playlist-item")).toHaveCount(1);
    await page.getByTestId("library-search").fill("no-such-track-xyz");
    await expect(page.getByTestId("library-no-matches")).toBeVisible();
  });

  test("next and previous change playlist selection", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles([pcmFixture, mp5lFixture]);
    await expect(page.getByTestId("playlist-item")).toHaveCount(2);
    await page.getByTestId("player-next").click();
    const items = page.getByTestId("playlist-item");
    await expect(items.nth(1)).toHaveClass(/accent/);
    await page.getByTestId("player-prev").click();
    await expect(items.nth(0)).toHaveClass(/accent/);
  });

  test("repeat mode cycles in UI", async ({ page }) => {
    await loadFixture(page, pcmFixture);
    const repeat = page.getByTestId("player-repeat");
    await expect(repeat).toHaveAttribute("data-repeat-mode", "off");
    await repeat.click();
    await expect(repeat).toHaveAttribute("data-repeat-mode", "all");
    await repeat.click();
    await expect(repeat).toHaveAttribute("data-repeat-mode", "one");
  });

  test("shuffle toggle updates UI", async ({ page }) => {
    await loadFixture(page, pcmFixture);
    const shuffle = page.getByTestId("player-shuffle");
    await shuffle.click();
    await expect(shuffle).toHaveAttribute("aria-pressed", "true");
  });

  test("clear queue empties playlist", async ({ page }) => {
    await page.getByTestId("player-file-input").setInputFiles(pcmFixture);
    await expect(page.getByTestId("playlist-item")).toHaveCount(1);
    await page.getByTestId("playlist-clear").click();
    await expect(page.getByTestId("library-empty")).toBeVisible();
  });

  test("loads ORIGAMI MP5-L v3 export and plays", async ({ page }) => {
    test.skip(!fs.existsSync(origamiFixture), "run pnpm alpha:origami-smoke first");
    await loadFixture(page, origamiFixture);
    await expect(page.getByTestId("codec-label")).toContainText(/MP5-L/i);
    await expect(page.getByTestId("mp5l-output-quality")).toContainText(/bit-exact/i);
    await expect(page.getByTestId("decode-path")).toContainText(/MP5-L WASM v3/i);
    await expect(page.getByTestId("player-load-error")).toHaveCount(0);
    const seek = page.getByTestId("seek-slider");
    const max = Number(await seek.getAttribute("max"));
    expect(max).toBeGreaterThan(100);
    await page.getByTestId("play-pause").click();
    await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause");
  });
});
