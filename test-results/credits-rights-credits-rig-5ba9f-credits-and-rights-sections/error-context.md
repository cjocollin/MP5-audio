# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: credits-rights.spec.ts >> credits / rights metadata >> converter exposes collapsed credits and rights sections
- Location: e2e\credits-rights.spec.ts:11:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('metadata-editor')
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for getByTestId('metadata-editor')

```

```yaml
- banner:
  - text: MP5 Alpha MP5-L v3 default Lossless PWA-ready Experimental
  - heading "MP5 Audio" [level=1]
  - paragraph: An experimental smart audio format, converter, and player.
  - paragraph: Convert audio into .mp5, play it back with MP5-L v3 lossless audio, and explore a format designed for rich metadata, cover art, lyrics, content guidance, waveform data, and future interactive audio.
  - paragraph: MP5 Alpha · v0.10.6-alpha
  - paragraph:
    - text: "Live demo:"
    - link "https://mp5-audio.vercel.app":
      - /url: https://mp5-audio.vercel.app
- button "Try the MP5-L demo"
- button "Convert audio"
- button "Open player"
- link "View GitHub":
  - /url: https://github.com/cjocollin/MP5-audio
- paragraph: Try the demo file
- paragraph:
  - text: Synthetic 440 Hz tone — no copyrighted music in the repo. For real listening tests, convert your own
  - strong: FLAC or WAV
  - text: in the Converter.
- button "Load MP5-L demo & play"
- button "Add demo to playlist"
- button "Load karaoke demo"
- paragraph: demo_mp5l_v3_tone.mp5 · demo_mp5l_v3_stems.mp5
- heading "What is MP5?" [level=2]
- paragraph: MP5 is a new experimental audio format. It is designed to store not only audio, but also the context around the audio — metadata, cover art, lyrics, waveform data, content guidance, mood/vibe tags, and future advanced audio features.
- paragraph: General-purpose audio for players, libraries, families, accessibility tools, and specialized apps. Optional content guidance and Haven/Recovery-style tags are available as specialized metadata — never required for playback.
- heading "Current Alpha modes" [level=2]
- article:
  - heading "MP5-L" [level=3]
  - list:
    - listitem: Recommended default
    - listitem: Lossless
    - listitem: Bit-exact
    - listitem: Clean listening mode
- article:
  - heading "MP5-C" [level=3]
  - list:
    - listitem: Experimental lab codec
    - listitem: Compressed research mode
    - listitem: May add hiss
    - listitem: Not for normal listening yet
- article:
  - heading "MP5-H" [level=3]
  - list:
    - listitem: Hybrid mode
    - listitem: MP5-C base + CORR correction
    - listitem: Clean when CORR is present
    - listitem: Large files, not default
- paragraph:
  - strong: PCM
  - text: is reference/debug only.
- heading "What makes MP5 different?" [level=2]
- heading "Works now" [level=3]
- list:
  - listitem: Smart metadata (title, artist, album)
  - listitem: Cover art
  - listitem: Lyrics
  - listitem: Waveform / seek data
  - listitem: Content guidance (optional)
  - listitem: Mood / vibe tags
  - listitem: MP5-L v3 convert & play
- heading "Experimental" [level=3]
- list:
  - listitem: MP5-C lab codec (may hiss)
  - listitem: MP5-H hybrid (large)
  - listitem: Specialized app metadata profiles
- heading "Future roadmap" [level=3]
- list:
  - listitem: Stems / interactive audio research
  - listitem: Better compression tuning
  - listitem: Library persistence
  - listitem: Offline & packaging polish
- heading "See the Alpha demo" [level=2]
- paragraph: Synthetic demo audio only — no copyrighted album art in repo screenshots.
- figure "Player":
  - img "MP5 Player with playlist, playback controls, and Format panel"
  - text: Player
- figure "Converter":
  - img "MP5 Converter importing audio and exporting MP5-L v3"
  - text: Converter
- figure "Metadata":
  - img "MP5 metadata editor with cover art, lyrics, and optional guidance"
  - text: Metadata
- heading "Try it — simple demo flow" [level=2]
- list:
  - listitem:
    - strong: Load the MP5-L demo
    - text: — synthetic tone, no copyrighted music
  - listitem:
    - strong: Convert your own
    - text: FLAC / WAV / MP3 / M4A / OGG (when supported)
  - listitem:
    - strong: Edit metadata
    - text: — title, cover, lyrics, optional guidance
  - listitem:
    - strong: Export MP5-L v3
    - text: — recommended lossless mode
  - listitem:
    - strong: Open in the player
    - text: — from export summary
  - listitem:
    - strong: Check the Format panel
    - text: — codec, bit-exact, decode path
- heading "Honest Alpha limitations" [level=2]
- list:
  - listitem: MP5 is experimental Alpha software — not a finished product codec.
  - listitem:
    - strong: MP5-L v3
    - text: is the recommended working mode for listening.
  - listitem:
    - strong: MP5-C
    - text: is research/lab-only because of audible hiss on some material.
  - listitem:
    - strong: MP5-H
    - text: can be clean with CORR applied but files stay large.
  - listitem: Large WASM/FFmpeg assets may take time to load on first visit.
  - listitem: Browser conversion is CPU- and memory-intensive for long files.
- paragraph: MP5 does not claim to beat MP3, AAC, Opus, or FLAC.
- heading "Alpha roadmap" [level=2]
- list:
  - listitem: Metadata polish
  - listitem: Better MP5-L compression
  - listitem: MP5-C redesign
  - listitem: Stems / interactive audio research
  - listitem: Desktop / mobile packaging
  - listitem: Offline improvements
  - listitem: Library persistence
- navigation "Main":
  - button "Player"
  - button "Converter"
  - button "Library"
  - button "Demo"
  - button "About"
  - button "Settings"
- main:
  - tablist "Converter mode":
    - tab "Single file" [selected]
    - tab "Batch"
  - heading "Convert to MP5" [level=2]
  - paragraph:
    - text: Drop FLAC, WAV, MP3, M4A, or OGG. Default export is
    - strong: MP5-L v3
    - text: . Review metadata, then export and open in the player.
  - list:
    - listitem: 1. Drop source audio
    - listitem: 2. Edit metadata
    - listitem: 3. Preview embedded metadata
    - listitem: 4. Export MP5-L v3
    - listitem: 5. Download / open in player
  - paragraph:
    - strong: "Default: MP5-L v3"
    - text: — lossless, bit-exact, modest compression. MP5-H is hybrid (large). MP5-C is lab-only and may hiss.
  - paragraph: Try the demo file
  - paragraph:
    - text: Synthetic 440 Hz tone — no copyrighted music in the repo. For real listening tests, convert your own
    - strong: FLAC or WAV
    - text: in the Converter.
  - button "Load MP5-L demo & play"
  - button "Add demo to playlist"
  - button "Load karaoke demo"
  - paragraph: demo_mp5l_v3_tone.mp5 · demo_mp5l_v3_stems.mp5
  - group: Supported source formats (Alpha)
  - text: Loading source…
  - button "Cancel conversion"
  - group: What do these codec modes mean?
  - text: Export format
  - combobox "Export format" [disabled]:
    - option "MP5-L v3 (lossless · default export · bit-exact)" [selected]
    - 'option "MP5-H (hybrid: MP5-C base + CORR · large · not default)"'
    - option "PCM (reference / debug · uncompressed)"
    - option "MP5-C (experimental / lab · may hiss · not for listening)"
  - text: Preset (MP5-C / MP5-H)
  - combobox "Codec preset" [disabled]:
    - option "Low"
    - option "Standard (smaller / may hiss)"
    - option "High (balanced)" [selected]
    - option "Extreme (finest MP5-C — still may hiss)"
  - paragraph: Loading FFmpeg decoder (first time, ~31 MB)…
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import path from "path";
  3  | import fs from "fs";
  4  | 
  5  | const toneFixture = path.join(process.cwd(), "test-fixtures/demo_mp5l_v3_tone.mp5");
  6  | const wavFixture = path.join(process.cwd(), "test-fixtures/compatibility/wav_mono_44k_short.wav");
  7  | const hasPlayerFixture = fs.existsSync(toneFixture);
  8  | const hasWavFixture = fs.existsSync(wavFixture);
  9  | 
  10 | test.describe("credits / rights metadata", () => {
  11 |   test("converter exposes collapsed credits and rights sections", async ({ page }) => {
  12 |     test.skip(!hasWavFixture, "run pnpm compatibility:fixtures");
  13 |     await page.goto("/");
  14 |     await page.getByRole("button", { name: "Converter", exact: true }).click();
  15 |     await expect(page.getByTestId("converter-panel")).toBeVisible();
  16 |     await page.getByTestId("converter-file-input").setInputFiles([wavFixture]);
> 17 |     await expect(page.getByTestId("metadata-editor")).toBeVisible({ timeout: 60_000 });
     |                                                       ^ Error: expect(locator).toBeVisible() failed
  18 |     await expect(page.getByTestId("credits-metadata-toggle")).toBeVisible();
  19 |     await expect(page.getByTestId("rights-metadata-toggle")).toBeVisible();
  20 |     await expect(page.getByTestId("identifiers-metadata-toggle")).toBeVisible();
  21 |     await page.getByTestId("credits-metadata-toggle").click();
  22 |     await expect(page.getByTestId("crdt-producer")).toBeVisible();
  23 |   });
  24 | 
  25 |   test("player metadata panel shows credits sections without blocking playback", async ({ page }) => {
  26 |     test.skip(!hasPlayerFixture, "run pnpm fixtures:generate");
  27 |     await page.goto("/");
  28 |     await page.getByRole("button", { name: "Player", exact: true }).click();
  29 |     await page.getByTestId("player-file-input").setInputFiles([toneFixture]);
  30 |     await expect(page.getByTestId("playlist-item")).toHaveCount(1, { timeout: 15_000 });
  31 |     await expect(page.getByTestId("metadata-credits-panel")).toBeVisible();
  32 |     await expect(page.getByTestId("metadata-rights-panel")).toBeVisible();
  33 |     await expect(page.getByTestId("metadata-identifiers-panel")).toBeVisible();
  34 |     await page.getByTestId("playlist-item-play").click();
  35 |     await expect(page.getByTestId("now-playing")).toBeVisible({ timeout: 10_000 });
  36 |   });
  37 | });
  38 | 
```