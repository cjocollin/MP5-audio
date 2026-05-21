# MP5 Alpha Demo Guide

Use this guide to show MP5 to someone in about five minutes. No copyrighted music is required — use the bundled synthetic fixtures or your own FLAC/WAV.

**Live demo:** https://mp5-audio.vercel.app — landing page explains MP5-L vs lab modes before visitors open tabs.

## Codec policy

| Codec | Role |
|-------|------|
| **MP5-L v3** | **Default / recommended** — lossless, bit-exact, modest compression |
| **PCM** | **Reference / debug** — uncompressed samples in the container |
| **MP5-H** | **Hybrid** — MP5-C base + lossless CORR; **clean when CORR is applied**, but **large**; not default |
| **MP5-C** | **Lab-only / experimental** — lossy; may **hiss** on all presets; not for normal listening |

**MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

## What to say during a demo

Short script you can read aloud:

1. **Opening** — “MP5 is a general-purpose smart audio format we’re prototyping — for music listeners, artists, podcasts, DJs, educators, and apps. It’s not claiming to replace MP3, AAC, Opus, or FLAC. Optional metadata can also support filtering, accessibility, and specialized apps like Haven.”

2. **Default mode** — “For real listening, we use **MP5-L v3**: lossless and bit-exact. The decoded audio matches the source sample-for-sample. It’s the **default and recommended** export in the converter.”

3. **Play demo file** — “I’ll load a small synthetic demo file — no copyrighted music in the repo. The Format panel shows MP5-L v3, bit-exact, and which WASM decode path ran.”

4. **Convert** — “If I drop a FLAC or WAV here, the app encodes **MP5-L v3** and downloads a `.mp5` automatically. Same player path as PCM fallback — no hidden loudness processing.”

5. **Honest limits** — “We’re not beating FLAC on size yet. MP5-L is modestly smaller than raw PCM on our reference track, not a magic smaller-than-FLAC codec.”

6. **What not to sell** — “**MP5-C** is lab-only — it can hiss; we don’t use it for normal playback. **MP5-H** is a hybrid: clean when the CORR correction layer is present, but files are much larger — also not the default. **PCM** in the container is just reference/debug.”

7. **Close** — “Before we ship a demo build, we run `pnpm alpha:check` — unit tests, Rust tests, fixture checks, and browser playback tests.”

## Prerequisites

- Node.js 20+
- Rust toolchain (for `pnpm alpha:check`)
- `pnpm install`
- `pnpm wasm:build` (required for MP5-L export in the browser)

See `docs/WASM_SETUP.md` if WASM fails to load.

## Run the app

```bash
pnpm install
pnpm wasm:build
pnpm dev
```

Open **http://localhost:5173** — you should see the **public landing** (hero, codec cards, screenshots), and **Player** / **Converter** tabs.

## Screenshots

| View | File |
|------|------|
| Player | [`docs/screenshots/Player.png`](screenshots/Player.png) |
| Converter | [`docs/screenshots/Converter.png`](screenshots/Converter.png) |
| Metadata | [`docs/screenshots/Metadata.png`](screenshots/Metadata.png) |

Also shown on the hosted landing at https://mp5-audio.vercel.app.

## Quick demo (recommended path)

### 1. Play a bundled demo file

1. On the welcome panel or **Player** tab, click **Load MP5-L demo & play** (synthetic tone — no copyrighted music in the repo).
2. Or drop `test-fixtures/demo_mp5l_v3_tone.mp5` manually — each valid file is added to the **playlist** (append on drop).
3. For real listening tests, convert your own **FLAC or WAV** in the Converter (not bundled commercial music).
4. Use **search** to filter by title, artist, album, genre, or mood/vibe tags.
5. Select a track, use **next/previous** or per-row **play**, and open the **metadata panel** below for full chunk details.
6. Check the **Format** panel:
   - **MP5-L v3 (lossless · default)**
   - Encoder **v3 (LPC + delta + varint)**
   - **Bit-exact: Yes (lossless)**
   - Decode path: **MP5-L WASM v3 decode (lossless)**
7. Press **Play** — seek and volume should work. Use **Shuffle** and **Repeat** (off → all → one) in the transport or playlist header. Playback auto-advances to the next track when a song ends.

### 2. Convert your own FLAC/WAV

**Batch (multiple files):** Converter → **Batch** → drop several WAV/FLAC/MP3/M4A/OGG files → **Start batch**. Each file exports **MP5-L v3** with detected tags, waveform/seek, and FING/HASH when possible. Say: **nothing uploads**; conversion is heavy; large batches are slow; closing the tab stops the queue. Use **Single file** to edit metadata before export. **Download all** saves separate `.mp5` files (no ZIP in this MVP).

**Performance / diagnostics:** Settings → open **Diagnostics (optional)** — playlist queue, decode cache (max 3 tracks), library bytes, WASM/FFmpeg status. Mention first-load codec download and that very large files or 12+ batch items show calm warnings (not hard blocks unless extreme).

1. Open the **Converter** tab — the step strip shows: drop source → edit metadata → preview → export → download / open in player.
2. Confirm **MP5-L v3** is selected (default).
3. Drop a FLAC or WAV file — status shows **decoding** then **extracting metadata** (no immediate download).
4. Edit metadata if needed — track info, cover, lyrics, optional **Content guidance** (content notices, sensitive themes, listener comfort), mood/vibe. Haven / Recovery is under **Specialized app metadata** (last in profile list; collapsed by default).
5. Check **Export preview** — detected vs what will be embedded.
6. Click **Export MP5** — progress shows waveform/seek build, encode, metadata chunks, validation, then **export summary** (filename, size, embedded flags).
7. Use **Download again**, **Open in Player**, **Add to playlist**, or **Save to library** — or switch to **Player** and drop the `.mp5` manually.

### 2c. Optional stems (manual or demo fixture)

**Quick demo:** Player → **Load stems demo** (or drop `test-fixtures/demo_mp5l_v3_stems.mp5`) — synthetic drums, bass, and melody; no copyrighted audio.

**Your own export:**

1. In **Converter**, after loading a source, open **Stems (optional)**.
2. Click **Import stems** or drop multiple WAV/FLAC/MP3/M4A/OGG files — review the batch summary (imported, skipped, guessed types).
3. Edit stem names/types if filename guessing is wrong (e.g. `lead_vocal.wav` → Lead vocals).
4. If sample rate or duration differs from the full mix, click **Normalize stems to match full mix** (applies to all stems). Use **Normalize all** or **Remove all** for bulk actions.
5. If all stems are longer than the mix, consider **Pad full mix** instead of trimming.
6. Export — full mix is still MP5-L v3 in AUDI; stems are optional add-ons.
7. In **Player**, read the **Stems** panel help text, then optionally enable **Mix stems in player** for mute/solo/volume.

Say out loud: stems are optional; full mix always works; no AI separation; normalization is a helper for session mismatches (trimming can remove audio); other players can ignore STEM/STDA; stem mix uses more memory and is experimental.

### 2d. Synced lyrics and karaoke (demo)

1. Player → **Load karaoke demo** (or drop `test-fixtures/demo_mp5l_v3_stems.mp5`).
2. Open the **Lyrics** panel — synced lines highlight during playback.
3. Toggle **Karaoke mode** — stem mix enables with instrumental/vocal preset when stems allow.
4. In **Converter**, add synced lines manually: `[00:12.50] Your line` (no AI lyrics).

Say: lyrics are optional; synced lyrics are manual; karaoke audio needs compatible stems.

### 2e. Song map / sections (demo)

1. Same **Load karaoke demo** file includes **SECT**, **HOOK**, and **HILT**.
2. Open **Song map** — five synthetic sections (Intro → Outro).
3. Use **Jump to chorus**, **Replay hook**, **Skip intro**, or click a section row.
4. Waveform shows faint section markers when WAVE data is present.

In **Converter**, add sections manually: `[00:00.00-00:12.00|Intro] Opening` — no AI analysis.

### 2f. Highlights and preview clips

1. In the **Highlights** list, try **Preview** on the verse clip (stops at end).
2. **Play** on the share highlight; use **Loop hook** for the hook range.
3. **Stop loop** returns to normal transport; repeat/shuffle unchanged.

Say: highlights are manual HILT metadata; no AI detection; no social export yet.

### 2g. Visual theme (VISU)

1. **Load karaoke demo** — Now Playing picks up **Calm demo** accent colors (soft indigo gradient on the cover card).
2. Open **Metadata** panel — **Visual theme (VISU)** shows theme name, mood, style, source, and color swatches.
3. **Settings** → uncheck **Apply VISU file themes** — player returns to default chrome (metadata still lists VISU).

In **Converter**, set theme name and hex colors under **Visual theme** — no AI palette extraction.

Say: VISU is optional display metadata; playback and codec path are unchanged; other players may ignore it.

### 2h. Album package (.mp5p)

1. Run `node scripts/generate-demo-album-package.mjs` after demo fixtures (or `pnpm fixtures:generate`).
2. On the **Player** tab, drop **`demo_album_package.mp5p`** together with **`demo_mp5l_v3_tone.mp5`** and **`demo_mp5l_v3_stems.mp5`**.
3. Read the manifest explainer banner; confirm **Found sidecar tracks** lists both files.
4. Track 1 = plain demo tone; track 2 = stems + karaoke + sections + highlights + VISU demo.
5. Album view may show optional **album credits / rights / identifiers** on the demo manifest (informational only).
6. **Play album** or **Add album to queue**; try **Save album** then open **Library → Saved albums**.
7. With 2+ tracks in the playlist, use **Create album package** — reorder tracks, read filename list, download manifest.
8. **Converter** — expand **Credits**, **Rights & license**, or **Release identifiers** (collapsed by default) before export.

Say: **`.mp5` is core**; **`.mp5p` is experimental**; keep manifest and sidecars in the same folder; no embedded archive yet; third-party players may ignore `.mp5p`.

### 2b. Local library (device-only)

1. Open the **Library** tab.
2. Drop `.mp5` files or use **Save to library** from the player playlist or converter export summary.
3. Search by title, artist, album, filename, genre, mood, or vibe; filter by codec, content guidance, cover, or lyrics.
4. **Play** loads into the player; **Queue** appends to the playlist; **Download** saves the file again.
5. Say out loud: files stay **on this browser/device** (IndexedDB). **No cloud upload.** Clearing browser/site data may remove them. Large files use storage quickly.

Exported filenames use **`Artist - Title.mp5`** when tags allow (sanitized). Non-default codecs add a variant suffix, e.g. `Track (PCM reference).mp5`. Browsers cannot overwrite downloads reliably; use **Download again** or the suggested `Track (MP5-L v3).mp5` pattern if you save twice.

**Player import:** dropping multiple `.mp5` files shows how many were added, skipped (not `.mp5`), or unreadable — valid files still load.

**Metadata policy:** optional content guidance is **never** auto-generated and does not affect playback. Most players can ignore specialized app metadata; Haven / Recovery is only one optional profile. See [`MP5_METADATA_SPEC.md`](MP5_METADATA_SPEC.md).

### 3. Compare codecs (optional)

| File | What to say |
|------|-------------|
| `demo_pcm_reference_tone.mp5` | “Reference / debug — raw PCM in the container, same playback path.” |
| `demo_mp5c_lab_tone.mp5` | “Lab-only experimental codec — Format panel warns about hiss; not our default.” |

Do **not** present MP5-C as a listening-quality default.

## Format panel cheat sheet

| Field | Meaning |
|-------|---------|
| **Codec label** | Container codec (MP5-L, PCM, MP5-H, MP5-C) |
| **Container / Encoder** | Bitstream version and mode |
| **Output quality** | Lossless bit-exact vs lossy / hybrid |
| **Decode path** | How the browser decoded audio (WASM path) |
| **Compression ratio** | File size vs raw PCM payload (informational) |

For MP5-L v3, decoded PCM is **mathematically identical** to the source (verified on ORIGAMI — see `benchmarks/real-music/ORIGAMI_L_PCM_PARITY.md`).

## Verify before a demo

```bash
pnpm alpha:check
```

Runs fixture generation, unit tests, Rust codec tests, fixture validation, and Playwright e2e. All steps must pass.

## Current limitations (say these out loud)

- MP5 does **not** claim to beat MP3, AAC, Opus, or FLAC.
- MP5-L v3 does **not** meet the stretch goal of ≤0.80× PCM size (~0.95× on ORIGAMI).
- MP5-L does **not** beat FLAC on reference material.
- MP5-C may hiss — lab/research only.
- MP5-H is clean with CORR but **much larger** than MP5-L; not default.
- Encode/decode in the browser is CPU-bound (WASM).
- Local library is **device/browser-local** only — no sync across machines.
- Playlist queue still does not restore file handles after a full page reload (library does persist MP5 bytes).
- Shuffle/repeat and mobile packaging are not polished yet.
- Mood/vibe AI tagging is not enabled; lyrics depend on source file tags.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Only PCM export available | Run `pnpm wasm:build`, refresh browser |
| Player shows decode error | Re-export with current converter (MP5-L v3) |
| No sound | Click Play after load; check OS/browser volume |
| e2e / alpha:check fails on fixtures | Run `pnpm fixtures:generate` |

## Next steps (post-demo)

- Roadmap: `docs/MP5_ROADMAP.md`
- Release notes: `docs/MP5_ALPHA_RELEASE_NOTES.md`
- Status: `docs/CURRENT_MP5_STATUS.md`
