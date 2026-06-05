# MP5 Alpha release notes

## v0.15.0-alpha — Public Beta readiness / app polish (May 2026)

**Version:** MP5 Audio **v0.15.0-alpha**

- **Landing:** Compact hero with `.mp5` / `.mp5p` explainer; Demo guide button; “What works today” in Learn More.
- **Onboarding:** Welcome card wired (dismissible); explains MP5-L default, lab codecs, album packages.
- **Demo tab:** Guided paths A–E (song, karaoke/stems, embedded album, convert, batch album).
- **Diagnostics:** App version, WASM/FFmpeg/worker status, links to known issues and Beta checklist.
- **Mobile:** Min 40px tap targets; album panel overflow guard.
- **Docs:** [`MP5_MANUAL_QA_CHECKLIST.md`](MP5_MANUAL_QA_CHECKLIST.md); updated Beta readiness checklist.
- **Hosted:** Embedded album demo copied to `dist/fixtures/` on build.

## v0.14.0-alpha — Embedded album / MP5P UX polish (May 2026)

**Version:** MP5 Audio **v0.14.0-alpha**

- **Album package view:** Cover, title, artist, year/genre, package type badge, track count, size, integrity status, calm warnings.
- **Tracklist:** Track number, duration, codec/stems/lyrics/VISU badges, availability state, Play / Queue / Extract per track.
- **Embedded playback:** Lazy track load with “Loading embedded track…” status; album context in Now Playing (`Track N of M`, package badge).
- **Library:** Save confirmations with size estimate and browser-storage honesty; Saved albums lists manifest + embedded packages.
- **Extract:** `01 - Title.mp5` filenames; staggered multi-download with browser warning.
- **Batch handoff:** Post-export summary with Open in Player (album view), Save to Library, Download again.
- **Mobile:** Album cover and actions sized for narrow viewports.
- **Tests:** expanded `tests/albumPackage.test.ts`, expanded `e2e/embedded-album-package.spec.ts`.

## v0.13.1-alpha — Acceptance gate + playback e2e hardening (May 2026)

**Version:** MP5 Audio **v0.13.1-alpha**

- **E2E stability:** `CI=1` runs one Playwright worker + one retry; playback tests poll seek slider / `current-time` via shared helpers.
- **Assertions:** Prefer `player-playback-status` + progress polls over fragile Play/Pause aria-label timing under WASM/stem load.
- **Docs:** Parallel e2e flake root cause in [`MP5_KNOWN_ISSUES.md`](MP5_KNOWN_ISSUES.md).
- **No product changes:** transport, formats, batch album builder, and embedded package logic unchanged.

## v0.13.0-alpha — Batch album builder / MP5P export MVP (May 2026)

**Version:** MP5 Audio **v0.13.0-alpha**

- **Batch album export** in Converter: metadata table, track reorder, album fields, cover inherit.
- Export **individual MP5**, **manifest `.mp5p` + sidecars**, or **embedded `.mp5p`** from one batch session.
- **Open in Player** handoff for completed tracks; honest warnings for size and multi-download limits.
- Tests: `tests/batchAlbumBuilder.test.ts`, `e2e/batch-album-builder.spec.ts`.

## v0.12.1-alpha — VISU mobile containment hotfix (May 2026)

**Version:** MP5 Audio **v0.12.1-alpha**

- **Fix:** Cover art and VISU tints no longer paint a full-page wallpaper on mobile — scoped to Now Playing only.
- **Layout:** Player / Now Playing appears above the playlist on narrow viewports; cover card capped smaller on mobile.
- **Settings:** Clarified that file themes apply to Now Playing only, not the global app shell.
- **Tests:** `visual-theme-containment` e2e + unit guards for cover card / `url()` backgrounds.

## v0.12.0-alpha — Embedded album bundle prototype (May 2026)

**Version:** MP5 Audio **v0.12.0-alpha**

### Added

- **Embedded `.mp5p` format:** `MP5P` magic, manifest `mp5-album-embedded-v1`, track directory, fragmented embedded `.mp5` payloads (12 MiB default / 16 MiB max per fragment, CRC32 + SHA-256).
- **Lazy embedded ingest:** index on open; load track bytes on play/select; existing `.mp5` playback path unchanged.
- **Create UI:** manifest vs embedded export modes; embedded size warning.
- **Import UI:** package type, size, per-track embedded sizes, extract `.mp5`, play album/queue.
- **Library MVP (Option A):** save embedded package blob to IndexedDB with size warning.
- **CLI:** `pnpm inspect:mp5` / `pnpm validate:mp5p` report embedded packages; `pnpm fixtures:embedded-album`.
- **Fixture:** `test-fixtures/demo_embedded_album_package.mp5p`.

### Unchanged

- JSON manifest `.mp5p` + sidecar support; single `.mp5` playback; no AI/codec/DRM/policy changes.

## v0.11.0-alpha — Real playback regression harness MVP (May 2026)

**Version:** MP5 Audio **v0.11.0-alpha**

### Added

- **Playback regression checklist:** [`MP5_PLAYBACK_REGRESSION_CHECKLIST.md`](MP5_PLAYBACK_REGRESSION_CHECKLIST.md) — manual gates + Pity Party local stress guidance.
- **Synthetic Pity Party class fixture:** `test-fixtures/demo_pity_party_class.mp5` — 10 STDF stems, no instrumental, LYRC/SECT/VISU, ~22 s; `pnpm fixtures:pity-party-class`.
- **Playback trace export:** regression snapshot fields + **Copy playback trace** in Diagnostics.
- **Focused gate:** `pnpm playback:check` — timing unit tests, transport/karaoke tests, `e2e/playback-regression.spec.ts`, fixture validation.
- **E2E behavioral coverage:** play time advance, waveform seek, karaoke play without waveform, stem toggles, late Lead Vocal join, scroll stability.

### Unchanged policy

- No AI generation, codec, DRM, format chunk, or STDA/STDF format changes in this milestone.

## v0.10.12-alpha — Real playback state audit + transport fix (May 2026)

**Version:** MP5 Audio **v0.10.12-alpha**

- First **Play** on lazy-ingest files: preparing state + PCM-ready auto-start; `loadFile` no longer clears `isPlaying` when user already requested play.
- Removed stem mixer auto `startAllAt` on empty sources (was disposing the graph mid-session).
- UI clock gated on active Web Audio sources; stem `onended` no longer sets seek to duration while other stems play.
- Lyrics panel: container-local scroll only (fixes page jumping to lyrics/song map).
- Playback trace buffer + Diagnostics toggle.
- Karaoke mode: main **Play** uses the same `requestPlayback` path as waveform seek; stem mix starts without clicking the waveform; progress clock follows the active transport in karaoke mode.
- **Late-loaded stem sync:** `capturePlayhead` re-anchors `startedAtRef` (idempotent snapshot); repeated captures after blocking `pcmToAudioBuffer` no longer double-count elapsed time (fixes karaoke lead vocal starting far ahead of the mix).
- Batch stem starts share one Web Audio `when`; seamless ops serialized; overlap detection stops both engines; late join uses single-stem insert (not full-graph restart).

## v0.10.11-alpha — Stem mixer clock / unmute / scroll (May 2026)

**Version:** MP5 Audio **v0.10.11-alpha**

- Unmuting an unloaded stem during stem mix no longer stops playback; per-stem background decode and insert-at-playhead when ready.
- Single canonical playback clock for seek bar (full mix vs stem mix); stem source end re-sync fixes progress racing to the end.
- Lyrics and song map auto-scroll inside their panels only; optional toggles; no page jump on active line/section change.

## v0.10.10-alpha — Stem mixer seamless toggle (May 2026)

**Version:** MP5 Audio **v0.10.10-alpha**

### Fixed

- **Restart on checkbox/mute during stem mix:** uncheck called `onStemTracksSync` → full `loadTracks()` rebuild; mute path stopped/restarted sources.
- Removed `useEffect` on `stemTracks` that reloaded the graph on every state change.

### Added

- Seamless ops: `insert` / `remove` / `audible` only — no `loadTracks` from UI toggles.
- Engine API: `loadInitialTracksForMix`, `insertStemAtCurrentOffset`, `removeStemOnly`, `patchStemAudible` (mute = gain 0, source keeps running).
- Explicit **Restart stem mix** button.
- Playhead regression warnings in dev; e2e playhead preservation test.

---

## v0.10.9-alpha — Stem transport exclusivity / no overlap (May 2026)

**Version:** MP5 Audio **v0.10.9-alpha**

### Fixed

- **Double playback / overlap:** live stem load called `onStemTrackAdd` then `onStemTracksSync`, which triggered a full `loadTracks()` restart while sources were already playing.
- **Full mix + stem mix together:** explicit transport authority — starting stem mix stops full mix; returning to full mix stops all stem sources.
- **Duplicate stem sources:** per-stem `AudioBufferSourceNode` registry; no second source for the same `stemId`.
- **Stale async inserts:** graph generation token invalidates decode completions after mode switch or cancel.

### Added

- Transport diagnostics line in Stems panel (mode, transport id, graph generation, active source count).
- Unmute on loaded stem during stem mix starts a single source at current playhead when none exists (gain-only otherwise).

---

## v0.10.8-alpha — Stem mixer toggle / live stem add (May 2026)

**Version:** MP5 Audio **v0.10.8-alpha**

### Fixed

- **Stem checkbox / mute stopped playback:** UI changes no longer call `loadTracks()` → `stopAll()` + offset reset on every toggle.
- **Selection vs mix:** checkbox only marks **Selected**; full mix keeps playing until **Enable stem mix**, **Solo**, **Prepare selected**, or **Karaoke**.
- **Mute during stem mix:** gain-only `patchTracks()` when buffers are already loaded.
- **Playhead:** switching to stem mix captures current time and starts stem sources at that offset.

### Added

- **Live stem insert:** `insertStemAtOffset()` schedules a newly loaded stem at the current playhead during active stem mix.
- **State badges:** Selected · Loaded · Active · Muted · Preparing · Available.
- **Enable stem mix** button (separate from **Prepare selected**).
- Transport modes: `full_mix` | `stem_mix` | `solo_stem` | `karaoke`.

---

## v0.10.7-alpha — Lazy STDF stem lookup hotfix (May 2026)

**Version:** MP5 Audio **v0.10.7-alpha**

### Fixed

- **“No stem audio data for …”** on large lazy-ingest files (e.g. multi-stem STDF): worker stem jobs now load STDF fragments by **stemId** from the lazy index instead of empty eager `stdfGrouped`.
- **Lazy stem validation:** `validateStemFromParsed` / `summarizeStemStorage` use `stdfFragmentIndex` when payloads are not eager-loaded.
- **Inspect stem audit:** `pnpm inspect:mp5` lists per-stem fragment counts and availability for STDF files.

### Added

- Stems panel per-stem status: **Available**, **Missing fragments**, **Partial fragments**, **Loaded**.
- **Visible VISU on active player:** cover accent ring + gradient scrim, player column wash, waveform accent, metadata theme status line; preset colors when VISU has no hex (Pity Party–style files).
- **Compact public landing:** short hero + primary actions; **Player / Converter** tabs directly below; detailed marketing in collapsible **Learn more about MP5** (default collapsed; remembers preference).

### Unchanged

- Lazy blob ingest (≥48 MiB), 64 MiB chunk cap, codec policy, STDF v1 format, on-demand fragment loading.

---

## v0.10.6-alpha — Large-file lazy ingest (May 2026)

**Version:** MP5 Audio **v0.10.6-alpha**

### Added

- **Lazy blob chunk index** for files ≥48 MiB — scan via `File.slice`, no full-file `arrayBuffer()` in playlist state.
- **On-demand payloads:** AUDI for full mix; STDF fragments per selected stem only.
- **Staged ingest UI:** Scanning chunks → Preparing full mix → Loading optional metadata → Integrity pending.
- **Diagnostics:** ingest mode, chunk/STDF counts, loaded MB, timing (Settings → Diagnostics).

### Unchanged

- Codec policy, 64 MiB chunk cap, STDF v1 wire format, STDA v1, worker stem decode, `audio_verified` integrity rules.

---

## v0.10.5-alpha — Large-file playback + STDF CRC + VISU hotfix (May 2026)

**Version:** MP5 Audio **v0.10.5-alpha**

### Fixed

- **STDF false CRC mismatch** on worker stem solo/prepare (missing `payloadCrc32` on worker wire; buffer detach risk).
- **VISU visible themes** when file has metadata but no hex colors (style presets + stronger Now Playing chrome).
- **Large file ingest:** yielding `parseMp5Async` (≥ 48 MiB), staged status labels, cached `rawBuffer`, skip re-parse on playback, HASH/FING deferred until after decode.

### Unchanged

- Codec policy, 64 MiB cap, lazy/selected stems, worker stem decode path.

---

## v0.10.4-alpha — Worker-based stem decoding hotfix (May 2026)

**Version:** MP5 Audio **v0.10.4-alpha**

### Added

- **Web Worker** for heavy stem preparation (STDF reconstruct + MP5-L WASM decode).
- **Per-stem transferable payloads** — only the selected stem’s fragments are posted to the worker (not a full-file copy per stem).
- **Progress UI** — phases (loading fragments / reconstructing / decoding), percent, cancel.
- **Worker diagnostics** in Stems panel; calm **fallback** to main-thread decode if Worker/WASM unavailable.
- Profile notes: [`MP5_STEM_WORKER_PROFILE.md`](MP5_STEM_WORKER_PROFILE.md).

### Unchanged

- Lazy/selected stem behavior, full mix on main path, karaoke subset rules, STDF/STDA v1, codec policy, 64 MiB cap, no AI separation.

---

## v0.10.3-alpha — Large stem playback / mixer performance (May 2026)

**Version:** MP5 Audio **v0.10.3-alpha**

### Fixed

- **Player no longer freezes** on large STDF stem files (e.g. 10 stems / 200+ MB embedded data).
- **Lazy stem parsing** — stem frames are not all reconstructed on file open.
- **Adaptive Stems panel** — full mix always ready; solo, prepare selected, progress + cancel.
- **Karaoke** — instrumental-only decode when available; otherwise progressive non-vocal stems.
- **Synced lyrics** — active line follows Web Audio playback clock (~15 fps UI).

### Unchanged

- STDF/STDA v1 storage (v0.10.2), codec policy, 64 MiB chunk cap, no AI stem separation.

---

## v0.10.2-alpha — Large embedded stems hotfix (May 2026)

**Version:** MP5 Audio **v0.10.2-alpha** (no version bump beyond this milestone)

### Fixed

- **Large stem exports** no longer fail with `Chunk payload exceeds 67108864` when many embedded stems (e.g. 10× ~35 MB) plus rich metadata would overflow a single **STDA** chunk.
- **Segmented STDF v1** storage: large embedded stem sets are split into multiple **STDF** fragments (~12 MiB each), each under the container **64 MiB** per-chunk cap (unchanged).
- **STDA v1** unchanged for small stem sets (combined stem data under ~48 MiB safe budget).
- **STEM** manifest reports `storageMode: "stda-v1" | "stdf-v1"` and per-stem `fragmentCount` when segmented.
- **`pnpm inspect:mp5`** reports stem storage mode, fragment count, and stem data sizes.
- **HASH** integrity entries include each **STDF** fragment.

### Also in v0.10.x (prior patches)

- **v0.10.1-alpha:** stem import single file picker; pre-import RAM warnings (not hard block); sequential normalize for large batches.
- **v0.10.0-alpha:** beta readiness docs, `pnpm beta:check`, golden fixtures, centralized user-facing errors.

### Unchanged (this milestone)

- Codec policy: **MP5-L v3** default · **MP5-C** lab-only · **MP5-H** hybrid/large/not default · **PCM** reference/debug.
- No new product features; no codec work; **64 MiB** chunk limit not raised.

### Verify

```bash
pnpm alpha:check    # or pnpm beta:check
pnpm inspect:mp5 <file>    # shows stdf-v1 + STDF×N when segmented
pnpm validate:mp5 <file> --profile rich
```

Hosted demo: **https://mp5-audio.vercel.app** — UI badge **MP5 Alpha · v0.10.2-alpha**.

---

## Milestone: MP5 Alpha Release Package

The project is **validated**, **demo-ready**, and packaged for sharing:

- **One-command demo:** `pnpm demo` (setup checks + dev server)
- **Release checklist:** [`docs/MP5_ALPHA_RELEASE_CHECKLIST.md`](MP5_ALPHA_RELEASE_CHECKLIST.md)
- **In-app:** About + Demo tabs, global WASM setup banner
- Demo guide: [`docs/MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md)
- Verification gate: **`pnpm alpha:check`**
- Synthetic fixtures only in `test-fixtures/` (no copyrighted songs in repo)

---

## Codec policy

| Codec | Role |
|-------|------|
| **MP5-L v3** | **Default / recommended** — lossless, bit-exact, modest compression |
| **PCM** | **Reference / debug** — uncompressed fallback when WASM unavailable |
| **MP5-H** | **Hybrid** — MP5-C base + lossless CORR; **clean when CORR is applied**; **large**; not default |
| **MP5-C** | **Lab-only / experimental** — may hiss on all presets; not for normal listening |

**MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

---

## Status: validated

**MP5 Alpha is validated** on the ORIGAMI reference track (`- ORIGAMI!.flac` → `ORIGAMI_mp5l_v3_alpha.mp5`).

| Check | Result |
|-------|--------|
| Digital bit-exact (FLAC PCM vs MP5-L decode) | Pass — max diff 0, null test silent |
| Automated tests | `pnpm alpha:check` |
| Subjective headphone pass (MP5-L v3) | Clean — no obvious MP5-C-style hiss |
| Default / recommended export | **MP5-L v3** |

### Follow-up (post-Alpha)

- [ ] **MP5-L vs PCM playback parity** — same browser player, matched volume, blind A/B

See `benchmarks/real-music/ORIGAMI_L_PCM_PARITY.md`.

---

## What works

- **Converter:** FLAC/WAV/MP3/etc. → `.mp5` with **MP5-L v3** default; auto-download on drop
- **Player:** MP5-L v2/v3, PCM (reference), MP5-H (hybrid + CORR), MP5-C (lab)
- **Format panel:** Codec, encoder version, bit-exact line (MP5-L), decode path
- **Demo fixtures:** `demo_mp5l_v3_tone.mp5`, `demo_pcm_reference_tone.mp5`, `demo_mp5c_lab_tone.mp5`
- **WASM round-trip tests** and ORIGAMI benchmark tooling

## What is experimental

| Codec | Notes |
|-------|--------|
| **MP5-C** | Lab-only — may hiss; not for normal playback |
| **MP5-H** | Hybrid — clean with CORR; **~2× PCM** on ORIGAMI; not default |
| **PCM** | Reference / debug only |

## What is postponed

- MP5-C / MP5-H optimization and further MP5-L compression tuning
- MP5-L stretch goal ≤0.80× PCM (currently ~0.945× on ORIGAMI)
- Batch converter UI, shuffle/repeat, mobile/PWA polish
- Moonshot / advanced optional chunks

## Known limitations

- MP5 does **not** claim to beat MP3, AAC, Opus, or FLAC
- MP5-L does **not** beat FLAC on reference material
- MP5-C may hiss — lab/research only
- MP5-H files are much larger than MP5-L
- Browser encode/decode is CPU-bound (WASM)
- Lab tab and some optional chunks are stubs

## Next roadmap

See [`docs/MP5_ROADMAP.md`](MP5_ROADMAP.md):

1. Playback parity A/B in one browser session
2. Optional converter queue UI
3. v0.2 optional metadata display (LYRC, MOOD, …)
4. Further MP5-L compression research (no product promises)

---

## Default export: MP5-L v3

- **Recommended** for listening-quality exports
- **Lossless** and **bit-exact** (decoded PCM matches source)
- Modest compression (~5% smaller than raw PCM on ORIGAMI)
- Bitstream: `0x4c 0x03` (v3)

## How to demo

```bash
pnpm install
pnpm wasm:build
pnpm dev
pnpm alpha:check   # run before handoff
```

See [`docs/MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md).

## Upgrade notes

- New exports use MP5-L **v3** bitstream
- **v2** MP5-L (raw PCM blocks) still decodes
- Re-export old files for best compression
