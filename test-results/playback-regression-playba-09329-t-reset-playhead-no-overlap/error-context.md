# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: playback-regression.spec.ts >> playback regression — pity party class >> D. stem mix: toggles do not reset playhead; no overlap
- Location: e2e\playback-regression.spec.ts:139:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "loaded"
Received: "pending"

Call Log:
- Test timeout of 180000ms exceeded
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e6]:
        - heading "MP5 Audio" [level=1] [ref=e7]
        - paragraph [ref=e8]: MP5 Alpha · v0.15.1-alpha
      - paragraph [ref=e9]: An experimental smart audio format, converter, player, and album package system.
      - paragraph [ref=e10]:
        - generic [ref=e11]: .mp5 = one smart song (single track). MP5-L v3 is the recommended lossless codec.
        - generic [ref=e12]: .mp5p = one smart album/package — manifest (sidecar .mp5 files) or embedded (self-contained). Experimental.
      - generic [ref=e13]:
        - generic [ref=e14]: MP5 Alpha
        - generic [ref=e15]: MP5-L v3 default
        - generic [ref=e16]: .mp5 + .mp5p
        - generic [ref=e17]: PWA-ready
        - generic [ref=e18]: Experimental
      - generic [ref=e19]:
        - button "Try the MP5-L demo" [ref=e20] [cursor=pointer]
        - button "Demo guide" [ref=e21] [cursor=pointer]
        - button "Convert audio" [ref=e22] [cursor=pointer]
        - button "Open player" [ref=e23] [cursor=pointer]
        - link "View GitHub" [ref=e24] [cursor=pointer]:
          - /url: https://github.com/cjocollin/MP5-audio
    - generic [ref=e25]:
      - button "Learn more about MP5" [ref=e26] [cursor=pointer]
      - generic [ref=e27]: Codec modes, screenshots, and Alpha notes are here.
  - navigation "Main" [ref=e28]:
    - button "Player" [ref=e29] [cursor=pointer]
    - button "Converter" [ref=e30] [cursor=pointer]
    - button "Library" [ref=e31] [cursor=pointer]
    - button "Demo" [ref=e32] [cursor=pointer]
    - button "About" [ref=e33] [cursor=pointer]
    - button "Settings" [ref=e34] [cursor=pointer]
  - main [ref=e35]:
    - generic [ref=e36]:
      - generic [ref=e37]:
        - heading "Build your playlist" [level=3] [ref=e38]
        - list [ref=e40]:
          - listitem [ref=e41]:
            - text: Drop one or more
            - strong [ref=e42]: .mp5
            - text: files
          - listitem [ref=e43]: Tracks append to the queue — use next/previous or tap a row to play
          - listitem [ref=e44]: Search by title, artist, album, genre, or mood/vibe tags
          - listitem [ref=e45]:
            - text: Scroll to the
            - strong [ref=e46]: Format
            - text: panel below for codec, bit-exact, and decode path details
      - generic [ref=e47]:
        - generic [ref=e48]:
          - paragraph [ref=e49]: Try the demo file
          - paragraph [ref=e50]:
            - text: Synthetic 440 Hz tone — no copyrighted music in the repo. For real listening tests, convert your own
            - strong [ref=e51]: FLAC or WAV
            - text: in the Converter.
        - generic [ref=e52]:
          - button "Load MP5-L demo & play" [ref=e53] [cursor=pointer]
          - button "Add demo to playlist" [ref=e54] [cursor=pointer]
          - button "Load karaoke demo" [ref=e55] [cursor=pointer]
        - paragraph [ref=e56]: demo_mp5l_v3_tone.mp5 · demo_mp5l_v3_stems.mp5
      - generic "Drop .mp5 or .mp5p album manifest files to build a playlist" [ref=e57] [cursor=pointer]:
        - generic [ref=e58]: Drop .mp5 or .mp5p album manifest files to build a playlist
      - paragraph [ref=e59]: Playlist metadata is saved for this browser tab session only. Audio files must be dropped again after a full page reload.
      - generic [ref=e60]:
        - generic [ref=e61]:
          - generic [ref=e62]:
            - paragraph [ref=e64]: Playlist
            - generic [ref=e65]:
              - button "Shuffle off" [ref=e66] [cursor=pointer]
              - button "Repeat off" [ref=e67] [cursor=pointer]
            - searchbox "Search title, artist, album, genre, mood, vibe…" [disabled] [ref=e68]
            - generic [ref=e69]:
              - paragraph [ref=e70]: No tracks yet — drop .mp5 or .mp5p files above.
              - paragraph [ref=e71]: Search by title, artist, album, genre, or mood/vibe once tracks are loaded.
          - generic [ref=e72]: Add at least two playable .mp5 tracks to create an album package.
        - generic [ref=e73]:
          - generic [ref=e75]:
            - generic [ref=e77]: ♪
            - generic [ref=e78]:
              - heading "No track selected" [level=1] [ref=e79]
              - paragraph [ref=e80]: Drop MP5 files to build a playlist
            - paragraph [ref=e83]: Load an .mp5 file to see codec info
          - generic [ref=e85]:
            - paragraph [ref=e86]: Load an .mp5 file to enable playback
            - slider "Seek" [disabled] [ref=e87]: "0"
            - generic [ref=e88]:
              - generic [ref=e89]: 0:00
              - generic [ref=e90]: —
            - generic [ref=e91]:
              - button "Shuffle" [ref=e92] [cursor=pointer]
              - button "Repeat off" [ref=e93] [cursor=pointer]
            - generic [ref=e94]:
              - button "Previous" [disabled] [ref=e95]: ⏮
              - button "Play" [disabled] [ref=e96]: ▶
              - button "Next" [disabled] [ref=e97]: ⏭
            - generic [ref=e98]:
              - generic [ref=e99]: Volume
              - slider "Volume" [ref=e100]: "0.8"
      - group [ref=e101]:
        - generic "What do these codec modes mean?" [ref=e102] [cursor=pointer]
      - paragraph [ref=e104]: Load an .mp5 file to view metadata.
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import path from "path";
  3   | import fs from "fs";
  4   | import {
  5   |   parseDisplayedPlaybackTime,
  6   |   waitForPlaybackProgress,
  7   |   waitForSeekReady,
  8   | } from "./helpers/playbackTime";
  9   | import { dismissWelcomeOnboarding } from "./helpers/onboarding";
  10  | 
  11  | const pityClassFixture = path.join(
  12  |   process.cwd(),
  13  |   "test-fixtures/demo_pity_party_class.mp5",
  14  | );
  15  | const hasFixture = fs.existsSync(pityClassFixture);
  16  | 
  17  | function parseTime(s: string | null): number {
  18  |   return parseDisplayedPlaybackTime(s);
  19  | }
  20  | 
  21  | async function clickPlayAndWait(page: import("@playwright/test").Page): Promise<void> {
  22  |   const play = page.getByTestId("play-pause");
  23  |   await expect(play).toBeEnabled({ timeout: 90_000 });
  24  |   await play.click();
  25  |   const status = page.getByTestId("player-playback-status");
  26  |   try {
  27  |     await expect(status).toContainText("Playing", { timeout: 8_000 });
  28  |   } catch {
  29  |     await play.click();
  30  |     await expect(status).toContainText("Playing", { timeout: 25_000 });
  31  |   }
  32  | }
  33  | 
  34  | async function loadPityClass(
  35  |   page: import("@playwright/test").Page,
  36  |   opts?: { requireStems?: boolean },
  37  | ) {
  38  |   await dismissWelcomeOnboarding(page);
  39  |   await page.goto("/", { waitUntil: "domcontentloaded" });
  40  |   await page.getByRole("button", { name: "Player", exact: true }).click();
  41  |   await expect(page.getByTestId("player-file-input")).toBeAttached({ timeout: 30_000 });
  42  |   await page.getByTestId("player-file-input").setInputFiles(pityClassFixture);
  43  |   await expect
  44  |     .poll(
  45  |       async () => {
  46  |         const items = await page.getByTestId("playlist-item").count();
  47  |         if (items > 0) return "loaded";
  48  |         if ((await page.getByTestId("player-load-error").count()) > 0) return "error";
  49  |         return "pending";
  50  |       },
  51  |       { timeout: 180_000 },
  52  |     )
> 53  |     .toBe("loaded");
      |      ^ Error: expect(received).toBe(expected) // Object.is equality
  54  |   await waitForSeekReady(page);
  55  |   await expect
  56  |     .poll(async () => Number(await page.getByTestId("seek-slider").getAttribute("max")), {
  57  |       timeout: 90_000,
  58  |     })
  59  |     .toBeGreaterThan(5);
  60  |   if (opts?.requireStems !== false) {
  61  |     await expect(page.getByTestId("stems-panel")).toBeVisible({ timeout: 90_000 });
  62  |     await expect(page.getByTestId("stems-list").locator("[data-testid=stems-item]")).toHaveCount(
  63  |       10,
  64  |       { timeout: 30_000 },
  65  |     );
  66  |   }
  67  | }
  68  | 
  69  | async function seekToStart(page: import("@playwright/test").Page): Promise<void> {
  70  |   const seek = page.getByTestId("seek-slider");
  71  |   await seek.fill("0");
  72  |   await expect(seek).toHaveValue("0", { timeout: 5_000 });
  73  | }
  74  | 
  75  | test.describe("playback regression — pity party class", () => {
  76  |   test.describe.configure({ timeout: 180_000 });
  77  | 
  78  |   test.skip(!hasFixture, "run pnpm fixtures:pity-party-class");
  79  | 
  80  |   test("A. full mix: Play advances time and status is Playing", async ({ page }) => {
  81  |     await loadPityClass(page, { requireStems: false });
  82  |     await seekToStart(page);
  83  |     await clickPlayAndWait(page);
  84  |     await waitForPlaybackProgress(page, 0.05, 30_000);
  85  |     const t = parseTime(await page.getByTestId("current-time").textContent());
  86  |     expect(t).toBeGreaterThan(0);
  87  |     expect(t).toBeLessThan(15);
  88  |   });
  89  | 
  90  |   test("B. waveform seek changes time and playback continues", async ({ page }) => {
  91  |     await loadPityClass(page);
  92  |     await seekToStart(page);
  93  |     await expect(page.getByTestId("play-pause")).toBeEnabled({ timeout: 90_000 });
  94  |     await page.getByTestId("play-pause").click();
  95  |     await expect(page.getByTestId("play-pause")).toHaveAttribute("aria-label", "Pause", {
  96  |       timeout: 15_000,
  97  |     });
  98  |     await page.waitForTimeout(600);
  99  |     const beforeSeek = parseTime(await page.getByTestId("current-time").textContent());
  100 | 
  101 |     const waveform = page.getByTestId("waveform");
  102 |     await expect(waveform).toBeVisible();
  103 |     const box = await waveform.boundingBox();
  104 |     expect(box).toBeTruthy();
  105 |     await page.mouse.click(
  106 |       box!.x + box!.width * 0.55,
  107 |       box!.y + box!.height / 2,
  108 |     );
  109 | 
  110 |     let peakSeek = beforeSeek;
  111 |     await expect
  112 |       .poll(async () => {
  113 |         peakSeek = Math.max(
  114 |           peakSeek,
  115 |           parseTime(await page.getByTestId("current-time").textContent()),
  116 |         );
  117 |         return peakSeek;
  118 |       }, { timeout: 8_000 })
  119 |       .toBeGreaterThan(beforeSeek);
  120 |     expect(peakSeek).toBeLessThanOrEqual(12);
  121 |   });
  122 | 
  123 |   test("C. karaoke: Play without waveform advances progress", async ({ page }) => {
  124 |     await loadPityClass(page);
  125 |     await expect(page.getByTestId("lyrics-panel")).toBeVisible({ timeout: 15_000 });
  126 |     await page.getByTestId("karaoke-mode-toggle").click();
  127 |     await expect(page.getByTestId("stems-mix-active-note")).toBeVisible({
  128 |       timeout: 90_000,
  129 |     });
  130 |     await seekToStart(page);
  131 | 
  132 |     await clickPlayAndWait(page);
  133 |     await waitForPlaybackProgress(page, 0.05, 30_000);
  134 |     const t = parseTime(await page.getByTestId("current-time").textContent());
  135 |     expect(t).toBeGreaterThan(0);
  136 |     expect(t).toBeLessThan(15);
  137 |   });
  138 | 
  139 |   test("D. stem mix: toggles do not reset playhead; no overlap", async ({ page }) => {
  140 |     await loadPityClass(page);
  141 |     const items = page.getByTestId("stems-item");
  142 |     await expect(items).toHaveCount(10);
  143 | 
  144 |     await items.nth(0).getByTestId("stems-item-select").check();
  145 |     await items.nth(1).getByTestId("stems-item-select").check();
  146 |     await expect(page.getByTestId("stems-prepare-selected")).toBeEnabled({ timeout: 90_000 });
  147 |     await page.getByTestId("stems-prepare-selected").click();
  148 |     await expect(items.nth(0).getByTestId("stems-item-loaded")).toBeVisible({
  149 |       timeout: 90_000,
  150 |     });
  151 |     await expect(items.nth(1).getByTestId("stems-item-loaded")).toBeVisible({
  152 |       timeout: 90_000,
  153 |     });
```