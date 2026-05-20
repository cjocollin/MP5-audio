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

1. Open the **Converter** tab — the step strip shows: drop source → edit metadata → preview → export → download / open in player.
2. Confirm **MP5-L v3** is selected (default).
3. Drop a FLAC or WAV file — status shows **decoding** then **extracting metadata** (no immediate download).
4. Edit metadata if needed — track info, cover, lyrics, optional **Content guidance** (content notices, sensitive themes, listener comfort), mood/vibe. Haven / Recovery is under **Specialized app metadata** (last in profile list; collapsed by default).
5. Check **Export preview** — detected vs what will be embedded.
6. Click **Export MP5** — progress shows waveform/seek build, encode, metadata chunks, validation, then **export summary** (filename, size, embedded flags).
7. Use **Download again**, **Open in Player**, or **Add to playlist** — or switch to **Player** and drop the `.mp5` manually.

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
