# Changelog

All notable changes to MP5 Audio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with pre-release tags (`-alpha`, `-beta-candidate`).

## [Unreleased]

### Milestone - Docs sync, mobile density, vNext size pass

**Quality before compression.** MP5-L remains the default. MP5-C (v5.1) is unchanged.
No claim that MP5 beats MP3/AAC/Opus/FLAC/WAV.

- **Docs/compat:** `FLAG_RICE_PACKED`, AUDI `0x43 0x34`, CodecId MP5C2, and protect-1.5 status
  synced across format/container/codec/feature/compat docs (stale “no CodecId” notes cleared).
- **Mobile density (Phase 3.4):** capped scroll regions for stems/lyrics/playlist/album lists;
  collapsible stems help/diagnostics; sticky stem-prep progress bar with overall %.
- **vNext lossless L/B coalesce:** adjacent quiet/fragile units share one MP5-L encode (Rust + JS).
  `reverb_tail` ~0.68× → **~0.42× PCM**; hiss risk still **low**; `dense_music` unchanged ~0.97×.
- **vNext loud-path High preferred for size:** at protect 1.5, High keeps hiss risk **low** and
  shrinks `dense_music` ~0.971× → **0.941×** (real track ~0.977× → **0.968×**). Residual 2048
  pad ~0.6% → no short-frame trim. Lab hiss-report includes High + native High modes.

### Milestone - MP5-L packed Rice + 4-mode stereo; vNext protect experiment

**Quality before compression.** MP5-L remains the default. MP5-C (v5.1) is unchanged.
No claim that MP5 beats MP3/AAC/Opus/FLAC/WAV.

- **MP5-L `FLAG_RICE_PACKED` (6):** wires the existing bit-packed Rice codec into the payload path
  (legacy `FLAG_RICE` stays LPC+varint for compat). Per-block try-all-flags + roundtrip verify.
  Phase 4.0 go/no-go on synthetic corpus: **~46% payload savings** vs varint on LPC residuals.
- **Rice-cost-aware order selection** (`best_order_rice`) and **FLAC-style 4-mode stereo**
  (L/R, M/S, L/S, R/S) with verify-before-commit. Decoder accepts legacy varint + packed Rice;
  garbage Rice input never panics.
- **vNext protect-scale experiment — green:** trials 1.0–3.0 on a local commercial reference;
  **protect ≥ 1.5 → hiss risk low / bit-exact tails at ~0.97× PCM**. Shipping
  `encode_mp5c_vnext` and JS smooth params adopt the 1.5-widened thresholds;
  `encode_mp5c_vnext_protect` remains for A/B.

### Milestone - Hiss fix coalesce + MP5-C vNext lab export + Converter UX

**Quality before compression.** MP5-L remains the default. MP5-C (v5.1) is unchanged.
No claim that MP5 beats MP3/AAC/Opus/FLAC/WAV.

- **Lossy sub-block coalescing (vNext):** adjacent lossy units merge into one MP5-C encode
  (Rust `mp5c2` + JS `coalesce: true` on smooth modes). Synthetic `reverb_tail` stays hiss risk
  **low**; `dense_music` size drops ~1.17× → ~0.97× PCM vs no-coalesce. JS/native stay bit-identical.
- **Real-track gate:** local commercial reference re-encoded with native Extreme → full SNR ~39.5 dB,
  **tail SNR ~32.6 dB (hiss risk medium)** — better than MP5-C High/Extreme (~24–26 dB) but not yet
  the ≥40 dB “low” gate. Lab/advanced only; MP5-L stays recommended for sharing.
- **Public `CodecId.MP5C2` (5):** Converter can export vNext behind **Show lab / advanced codecs**;
  player decodes via `decode_mp5c_vnext`. Batch export stays MP5-L-only.
- **MP5-L compression:** silence-aware block planning + stronger stereo M/S correlation heuristic
  (bit-exact gates green). Higher-order LPC left at max 4 (overflow-safe).
- **Website:** codec select grouped Recommended / Debug / Lab; stems & AI behind advanced toggle;
  WASM cold-load progress bar in `WasmSetupBanner`.
- **Lab:** `validate-vnext-ref` command; hiss-report includes no-coalesce baseline for A/B size.

## [0.25.0-beta] - 2026-06

### Milestone - Native Rust MP5-C vNext (additive, MP5-C unchanged)

Ports the winning vNext "smooth" engine into the native Rust codec, carefully and additively.
**Quality before compression.** MP5-L stays the bit-exact default; **MP5-C (v5.1) is byte-identical
(unchanged)**; vNext stays lab-only, default OFF, never written to `.mp5`, not in the Converter, with
no public `CodecId`; no AI/DRM/telemetry; no copyrighted audio committed; no mainstream-codec claims.

- **Native engine:** new `rust/mp5-codec/src/mp5c2.rs` implements sub-block + per-band + hysteresis
  lossless fallback by composing the existing `mp5l` and `mp5c` codecs. Exposed via additive WASM
  functions `encode_mp5c_vnext` / `decode_mp5c_vnext` (lib.rs); existing exports untouched.
- **Bit-identical to the JS prototype:** lab mode `mp5c2-native-extreme` matches `mp5c2-smooth-extreme`
  with parity SNR = ∞ on every fixture; reaches `reverb_tail` hiss risk **low**; silence/quiet bit-exact.
- **MP5-C unchanged (proven):** the `mp5c` module was not modified; the vNext stream uses a distinct
  `0x43 0x34` magic (MP5-C is `0x43 0x06`) and the two decoders reject each other's containers. Full
  Rust suite (35 tests, release) **and** full JS suite (536 tests) pass against the rebuilt WASM — the
  regression proof that existing codec behavior is byte-identical.
- **Tests:** `tests/audioCompareLab.test.ts` adds native-vs-JS parity, native-reaches-low, and
  MP5-C-not-altered checks; `rust/mp5-codec/src/mp5c2.rs` adds 5 cargo tests (silence/quiet bit-exact,
  tail protection, loud-not-wasted, distinct-from-mp5c).
- **Known (pre-existing, not introduced):** `mp5c::pack_v5::tests::v5_modes_roundtrip` panics on a
  multiply-overflow only in **debug** `cargo test`; it passes in the project's `--release` gate (where
  the multiply wraps). The overflow is in untouched `mp5c` code and is left as-is for this milestone.
- **Docs:** updated codec status, vNext plan/results, the audio-lab mode matrix, and README.

## [0.24.0-beta] - 2026-06

### Milestone - MP5-C vNext Hysteresis/Lookahead + Noise-Shaping Experiment

Pushes MP5-C vNext quiet protection past the loud→quiet transition band and resolves the
Playwright e2e port collision. **Quality before compression.** MP5-L stays the bit-exact default;
MP5-C public behavior, the Converter, MP5/MP5P semantics, and the playback harness are unchanged;
vNext stays lab-only, default OFF, never written to `.mp5`, not in the Converter; no AI/DRM/telemetry;
no copyrighted audio committed; no mainstream-codec claims. `rust/` was read-only.

- **Hysteresis + lookahead tail latch** (`mp5c2-smooth`, `mp5c2-smooth-extreme`): once a sub-block is
  broadly quiet or low-level-and-staying-low for the next ~186 ms, the whole fade/tail is coded
  losslessly until a clearly-loud sub-block breaks the latch. This takes `reverb_tail` from hiss risk
  **medium → low** (quiet *and* tail windows bit-exact) at a size slightly smaller than v0.23.
  Full progression: severe (MP5-C) → high (block) → medium (sub-block+band) → **low** (+hysteresis).
- **Noise-shaping experiment — rejected with data** (`mp5c2-shaped-extreme`): JS pre/de-emphasis on
  lossy sub-blocks made `reverb_tail` tail SNR *worse* (33 → 27 dB) and adds nothing once the fragile
  content is already lossless. Real shaping belongs in the quantizer (a from-scratch transform codec) —
  documented in `docs/MP5C_VNEXT_PLAN.md`.
- **Hiss Risk fix:** `hissRisk()` now distinguishes "all quiet/tail windows bit-exact" (→ **low**) from
  "no quiet/tail windows at all" (→ **n/a**); previously the all-clean case mis-read as n/a.
- **Playwright e2e port fix:** the e2e webServer now uses a dedicated port (`E2E_PORT`, default 5188,
  `--strictPort`) so a developer's `pnpm dev` on 5173 can no longer collide with the e2e server.
- **Tests:** `tests/audioCompareLab.test.ts` adds smooth-reaches-low, the honest shaping-not-better
  check, and the Hiss-Risk low-vs-n/a distinction; existing gates kept intact.
- **Docs:** updated `MP5C_VNEXT_RESULTS.md`, `MP5C_VNEXT_PLAN.md`, the audio-lab mode matrix, codec
  status, and README.

## [0.23.0-beta] - 2026-06

### Milestone - MP5-C vNext Sub-block / Per-band Quiet Detection

Improves the experimental MP5-C vNext prototype from block-granular to sub-block and per-band
quiet protection, then measures the effect honestly. **Quality before compression.** MP5-L stays
the bit-exact default; MP5-C public behavior, the Converter, MP5/MP5P semantics, and the playback
harness are unchanged; vNext stays lab-only, default OFF, never written to `.mp5`, not in the
Converter; no AI, DRM, or telemetry; no copyrighted audio committed; no mainstream-codec claims.
`rust/` was read-only this milestone.

- **Sub-block detection:** vNext now decides lossless/lossy per ~23 ms (1024-frame) sub-block
  (`mp5c2-subblock`), so decaying tails switch to lossless as soon as they fall quiet — raising
  `reverb_tail` quiet-window SNR 12.6 → 22.3 dB vs the previous block-level vNext.
- **Per-band detection:** low-level sub-blocks carrying a quiet-but-present 3.6 kHz high-band tail
  escalate to lossless (`mp5c2-bandquiet`, `mp5c2-bandquiet-extreme`) — without wasting lossless on
  HF masked by a loud low end. This takes `reverb_tail` from hiss risk **high → medium** with
  bit-exact quiet windows (lossless coverage 56.7% → 74.5%). silence/quiet stay bit-exact; loud
  fixtures get 0% fallback. See `docs/MP5C_VNEXT_RESULTS.md`.
- **Frozen baseline:** block-level `mp5c2-lab` / `mp5c2-extreme` are kept unchanged for comparison.
- **Fallback-usage stats:** `vnextFallbackStats()` recovers protected-sample % (L = broadband-quiet,
  B = per-band tail) from any vNext container; the hiss report shows protected % and the active
  thresholds.
- **Noise-shaped quantization:** evaluated and **deferred** — real shaping needs control of the
  MP5-C quantizer (Rust); recorded as a medium-term redesign item in `docs/MP5C_VNEXT_PLAN.md`.
- **Honest size cost:** fine sub-blocks pad lossy units to the 2048 MP5-C frame, so loud material
  can exceed 1× PCM (dense_music ~1.17×) — compression stays secondary; vNext is not a shipping codec.
- **Tests:** `tests/audioCompareLab.test.ts` adds sub-block-triggers-in-loud-block, per-band-triggers
  -on-HF-tail, fallback-usage-in-report, and a no-regression-vs-previous-vNext gate; existing
  `audioQualityGates.test.ts` assertions kept intact.
- **Docs:** new `docs/MP5C_VNEXT_RESULTS.md`; updated vNext plan, audio-lab mode matrix + "How to hear
  vNext", codec status, hiss audit, and README.

## [0.22.0-beta] - 2026-06

### Milestone - MP5-C Hiss Audit + vNext Listening Lab

Audits the MP5-C hiss with synthetic fixtures **and** real reference exports, makes the
MP5-C vNext prototype runnable, and documents a quality-first redesign plan. **Quality
before compression.** MP5-L stays the bit-exact default; MP5-C public behavior, the
converter UX, MP5/MP5P semantics, and the playback harness are unchanged; no AI, DRM, or
telemetry; no copyrighted audio committed; no mainstream-codec claims.

- **Decode contract + self-test:** `tools/audio-lab/mp5file.mjs` decodes any `.mp5` through
  the app's authoritative path (parse → matching WASM decoder → trim to `totalSamples`),
  gated by a self-test that round-trips an MP5-L container bit-exact before any number is reported.
- **File comparison tooling:** `audio:inspect`, `audio:compare-files`, `audio:compare-set`,
  `audio:hiss-report`, `audio:bench:mp5c-vnext`, `audio:quality-report:mp5c`,
  `audio:export-listening:{mp5c,vnext}`. Listening WAVs use descriptive names
  (`pcm_reference`, `mp5c_current_high`, `mp5c_vnext_extreme`, …) under `listening/` and
  `local-listening/` (git-ignored).
- **Hiss metrics + Hiss Risk:** `tools/audio-lab/hiss.mjs` adds tail-window SNR, reverb-decay
  error, HF noise floor, error spectral flatness (compact FFT), noise-gate sweeps
  (−35/−45/−55 dBFS), and worst-quiet 500 ms/1 s windows, with committed Hiss Risk
  thresholds (low ≥40 · medium ≥25 · high ≥12 · severe <12 dB; quiet-class SNR, never full-song).
- **Root cause:** MP5-C quantizes in the **time domain** with a full-scale-relative step
  (4-band one-pole filterbank, **no MDCT**), so its broadband error hisses in quiet/decaying
  passages while loud passages mask it. On a real reference track MP5-C High is hiss-risk
  *high* at 0.968× PCM — larger than the MP5-L lossless file (0.871×). MP5-H + CORR is
  sample-exact but ~1.8× PCM. See `docs/MP5C_HISS_AUDIT.md`.
- **MP5-C vNext (`mp5c2-lab` High, `mp5c2-extreme` Extreme):** lab-only, default OFF, never
  written to `.mp5`. Takes silence/sustained-quiet to bit-exact and roughly doubles
  reverb-tail quiet SNR (4.8 → 10.6 → 12.6 dB); block-granular detection still leaves
  decaying tails partly lossy. Plan in `docs/MP5C_VNEXT_PLAN.md`.
- **Tests:** `tests/audioCompareLab.test.ts` (self-test, compare on generated `.mp5`, vNext
  exposure but not a converter default, Hiss Risk thresholds, git-ignore safety); existing
  `tests/audioQualityGates.test.ts` assertions kept intact.
- **Docs:** new `docs/MP5C_HISS_AUDIT.md` and `docs/MP5C_VNEXT_PLAN.md`; updated audio-lab
  mode matrix, codec status, current status, and README.

## [0.21.0-beta] - 2026-06

### Milestone - MP5 Audio Quality / Codec Lab MVP

Adds a serious in-repo audio quality lab and uses it to audit and safely
experiment on the MP5 audio modes. **Quality before compression.** MP5-L stays
the bit-exact recommended default; no codec policy, converter UX, MP5/MP5P
semantics, or playback-harness change; no AI, DRM, or telemetry; no copyrighted
audio committed; no mainstream-codec comparison claims.

- **Audio lab:** new `tools/audio-lab/` harness (fixtures, metrics, null test,
  report writers, CLI) driving the prebuilt codec WASM, with reports written to
  `benchmarks/audio-quality/` (generated output and listening WAVs are git-ignored).
- **Fixtures:** 13 synthetic categories (silence, quiet/loud/swept sine, pink/white
  noise, impulse, kick/snare, bass loop, vocal-like, stereo width, reverb tail,
  dense music). User-local files are supported via `--source` / `lab.config.json`
  and are never committed.
- **Honest metrics:** size, ×PCM ratio, encode/decode time, full-song SNR,
  quiet-window SNR, worst-1s SNR, RMS/peak error, noise floor, clipping, stereo
  correlation error, HF error, silence residual, duration match, bit-exact and
  content-exact. Full-song SNR is documented as misleading on its own.
- **Audit results:** MP5-L is bit-exact on every fixture (digital-silence null);
  MP5-C's quiet-passage hiss is now measured (reverb-tail quiet-window SNR ~2.6–5.7 dB
  while full-song SNR looks fine) and it stays lab-only; MP5-H + CORR is sample-exact
  content but averages >1× PCM and stays optional/not-default.
- **MP5-C vNext prototype (`mp5c2-lab`):** experimental, default OFF, never written
  to `.mp5`. Adaptive lossless fallback for quiet/silent blocks takes silence and
  sustained-quiet to bit-exact and improves reverb-tail quiet SNR (~4.8 → ~10.6 dB).
- **Commands:** `pnpm audio:bench[:mp5l|:mp5c|:mp5h]`, `audio:quality-report`,
  `audio:null-test`, `audio:export-listening`, `audio:gates`.
- **Gates:** new `tests/audioQualityGates.test.ts` (part of `pnpm test`) locks in
  MP5-L bit-exactness/no-drift, MP5-C's documented lossy/hiss status, MP5-H content
  exactness, the vNext prototype targets, no-crash robustness, and MP5-L-default policy.
- **Docs:** new `docs/MP5_AUDIO_QUALITY_LAB.md` and `docs/MP5_CODEC_STATUS.md`;
  updated limitations, known issues, current status, and README.

## [0.20.0-beta] - 2026-06

### Milestone - Spec / Developer Toolkit Polish

Refreshes MP5's developer-facing specs, compatibility docs, fixture catalog, and inspect/validate tooling while preserving existing playback, codec, and format behavior.

- **Docs/toolkit:** added the developer quickstart, compatibility matrix, fixture catalog, and refreshed chunk registry with Public Beta limits, support levels, safe-ignore rules, test coverage, and doc links.
- **Specs/status:** updated format, container, metadata, stems, album package, embedded package, VISU, hosted demo, install/demo, known-issues, status, and beta-readiness docs for v0.20.0-beta.
- **CLI polish:** `inspect:mp5`, `validate:mp5`, and `validate:mp5p` now provide clearer `--help` text, profile explanations, examples, and structural/rights disclaimers.
- **Tests:** added developer toolkit doc coverage and updated Public Beta readiness/spec/deployment assertions for v0.20.0-beta.
- **No behavior expansion:** no codec work, AI generation, playback transport rewrite, converter encoding behavior change, MP5/STDF/MP5P/LYRC/VISU/metadata semantic change, telemetry, upload, or cloud sync.

## [0.19.0-beta] - 2026-06

### Milestone - Player / Listening UX Polish

Makes the player clearer and more premium for real listening while preserving the stable playback transport and existing MP5/STDF/MP5P semantics. **No codec work, AI generation, telemetry, cloud sync, or format-policy changes.**

- **Now Playing:** normalized title/artist/album/source display, `.mp5` vs manifest `.mp5p` vs embedded `.mp5p` badges, album track position, current/duration/remaining time, embedded hydration state, integrity badge, and default VISU fallback label.
- **Queue / album context:** playlist rows now show source badges, album/package context, clearer selected/playing/hydrating status, thumbnails/fallbacks, and duration without decoding rows just for display.
- **Timeline / waveform:** larger mobile seek target, remaining-time label, disabled/loading state, and safe waveform seek preview.
- **Lyrics / karaoke:** clearer synced/karaoke mode label, stronger current lyric highlight, previous/upcoming context, section headers, and a better empty state without changing LYRC/SECT/HOOK/HILT behavior.
- **Stems:** rows show explicit audible/ready/preparing/muted states, larger mobile controls, and less ambiguity when a checked stem is not currently audible.
- **VISU / diagnostics:** VISU remains contained to the Now Playing/player area with a default visual fallback; copy diagnostics redacts local paths in player file labels and playback traces.
- **Tests:** new player listening UX unit coverage plus e2e assertions for Now Playing badges, queue row status, stem row state, mobile controls, and embedded album source context.

## [0.18.0-beta] - 2026-06

### Milestone — Export / Package Polish

Makes exporting and `.mp5p` package creation safer and clearer for Public Beta users. **No format, codec policy, or playback changes.**

- **Safer filenames:** centralized sanitizer guards Windows reserved names and trailing dots; batch and "Download all" exports now de-duplicate filenames so same-titled tracks can't overwrite each other; shared safe `.mp5p` package naming.
- **Package validation:** pre-export preflight blocks invalid packages (fewer than two tracks, missing embedded payloads, unsafe/duplicate track IDs) while leaving harmless missing metadata as warnings; post-export verification validates the embedded package (header/manifest always, per-fragment CRC under 64 MiB) or manifest JSON and shows "Package validation passed" / a clear warning.
- **Export review step:** Batch Album Builder shows a pre-export review with mode, album/track summary, estimated size, cover status, missing-metadata warnings, manifest-vs-embedded guidance, and honest reminders (MP5-L recommended, browser-local, keep originals).
- **Progress + post-export actions:** package build shows staged status; post-export actions include Open in Player, Save to Library, Download again, and **Copy summary** (path-free). Single-file export gains **Copy summary** too.
- **Recoverable batch failures:** failed items keep successful exports and entered metadata, support retry, and a new **Copy error summary** (redacted, no local paths).
- **Diagnostics:** Copy diagnostics now includes export context (mode, codec/preset, track count, package type, warning count, last export error) with local paths redacted; no audio data, no auto-upload.
- **Guidance:** concise manifest `.mp5p` (small, needs sidecars) vs embedded `.mp5p` (self-contained, can be large) explainer at export time.
- **Tests:** 24 new unit tests (filename sanitization/dedup, preflight, post-export verification, guidance, summary/diagnostics text); e2e for the review panel and embedded package validation/copy actions.

**Still not claimed:** production-ready, beats MP3/AAC/Opus/FLAC, DRM, legal proof, AI stems, cloud sync.

## [0.17.1-beta] - 2026-06

### Milestone — Audit cleanup closeout + release gate

- **Library polish (carried from v0.17.0):** unified collection view, search/filter/sort, storage stats, recents, embedded lazy cards, delete confirmations.
- **Repo hygiene:** removed throwaway generator scripts; `.gitignore` now excludes `*.tsbuildinfo` and `test-results/`; added `.gitattributes` for LF-normalized text.
- **Dev toolchain:** Vitest `^2.1.8` → `^3.2.6`; global test timeout raised to 20s for heavy STDF/stem tests under CI load; `pnpm audit` reduced from 5 findings (1 critical) to 1 dev-only high (esbuild via Vite 6 — accepted; Vite major upgrade deferred).
- **Parser hardening (guards only, no format semantics change):** embedded `.mp5p` file-size cap; manifest/directory length caps; fragment `recordLength` cap; `MAX_ALBUM_MANIFEST_JSON_BYTES` before `JSON.parse`; metadata prefix parser chunk/payload limits; ingest size checks.
- **Fix:** manifest album `sizeBytes` uses UTF-8 byte count, not JS string length.
- **Tests:** 2 embedded package hardening tests added.

**Still not claimed:** production-ready, beats MP3/AAC/Opus/FLAC, DRM, legal proof, AI stems, cloud sync.

## [0.17.0-beta] - 2026-05

### Milestone — Library / Saved Albums polish

- Unified **Library** collection view: saved tracks, manifest albums, embedded `.mp5p` packages, and recently opened items.
- Search, filter (kind), and sort across library items without parsing embedded blobs for cards.
- Storage usage panel with app-managed totals and browser quota when available.
- Item actions: play/queue/download/delete with confirmations; album open/play/download; copy summary; recent reopen/remove.
- Privacy copy: local-only storage, site-data warnings, no upload, no rights verification.
- Embedded package cards use cached manifest metadata only (lazy on open/play).

**Still not claimed:** production-ready, beats MP3/AAC/Opus/FLAC, DRM, legal proof, AI stems, cloud sync.

## [0.16.2-beta] - 2026-05

### Milestone — Public Beta hardening + feedback loop

- In-app **Report a bug / Give feedback** (Settings) with GitHub Issues links; no telemetry.
- **Copy diagnostics** in Settings (version, browser, WASM/FFmpeg, last error, privacy note).
- GitHub issue templates: bug report, Beta feedback, MP5 compatibility, feature request.
- [`docs/MP5_PUBLIC_BETA_RELEASE_NOTES.md`](docs/MP5_PUBLIC_BETA_RELEASE_NOTES.md) and GitHub release draft.
- First-user guidance on landing and Demo guide; physical phone QA checklist (section L).

**Still not claimed:** production-ready, beats MP3/AAC/Opus/FLAC, DRM, legal proof, AI stems.

## [0.16.1-beta] - 2026-05

### Milestone — Public Beta

- **MP5 Audio v0.16.1-beta** — first **Public Beta** tag for the hosted demo at https://mp5-audio.vercel.app.
- Version badge: **MP5 Public Beta · v0.16.1-beta** (landing + in-app).
- Final local gates, package fixtures, and HADES local QA accepted before tag.
- Hosted verification and `test:e2e:hosted` **11/11** after deploy.

**Still not claimed:** production-ready, beats MP3/AAC/Opus/FLAC, DRM, legal proof, AI stems, universal support.

## [0.16.1-beta-candidate] - 2026-05

### Fixed — Hosted embedded album demo

- **Demo guide → Load embedded album demo** no longer switches to Player before ingest completes (race that dropped `pendingAlbumPackage` on first mount).
- Landing badge copy: **MP5 Beta Candidate** (was **MP5 Alpha**).
- Expanded hosted QA e2e (`test:e2e:hosted` 11/11) including embedded album, mobile viewport, diagnostics trace toggle.

### Milestone — Manual QA sign-off

- Hosted desktop + mobile QA pass at https://mp5-audio.vercel.app.
- **Ready to tag public Beta** (maintainer decision; still experimental, not production-ready).

## [0.16.0-beta-candidate] - 2026-05

### Milestone — Beta Candidate declaration

- First **Beta Candidate** release — public demo candidate at https://mp5-audio.vercel.app; still experimental, not production-ready.
- Version badge: **MP5 Beta Candidate · v0.16.0-beta-candidate**.
- All automated gates pass (`pnpm test`, `test:e2e`, `alpha:check`, `beta:check`, `playback:check`, `deploy:check`).
- Embedded `.mp5p` (incl. HADES-scale manual QA), hosted demo, and package validation accepted.

**Not claimed:** full public Beta, production-ready, beats MP3/AAC/Opus/FLAC, legal proof, DRM, universal support.

## [0.15.7-alpha] - 2026-05

### Fixed — Beta gate doc encoding

- `docs/MP5_MANUAL_QA_CHECKLIST.md` saved as UTF-8 (was UTF-16), fixing `betaReadiness.test.ts` / `alpha:check` failure on Windows.

### Milestone — Final local gate cleanup

- Clean `CI=1` runs: `test:e2e` (75/75), `alpha:check`, and `beta:check` all pass with port 5173 free.

## [0.15.6-alpha] - 2026-05

### Fixed — Embedded album playlist durations

- Loaded embedded tracks (e.g. first album row) show HEAD-derived duration instead of stale manifest half-length.
- Metadata prefetch updates duration on hydrated tracks; hydrate prefers decoded file duration over manifest.

### Milestone — Hosted demo lock

- Production deploy to https://mp5-audio.vercel.app accepted at **v0.15.6-alpha** (`hosted:verify`, `test:e2e:hosted`).
- Beta candidate readiness docs updated; HADES `.mp5p` manual QA accepted locally.

## [0.15.5-alpha] - 2026-05

### Fixed — Playlist Play on unloaded tracks

- Row **Play** on a track that has not been loaded yet starts playback and keeps playing (no brief blip then stop).
- Metadata prefetch no longer re-triggers track load when `parsed` is patched on placeholders.
- Duplicate embedded hydrate and redundant `loadFile` calls are guarded while play intent is preserved through decode.

## [0.15.4-alpha] - 2026-05

### Fixed — Playlist Play button

- Playlist row **Play** on the current track now starts playback without requiring the main transport Play button.
- Preserves play intent during track load when `playWhenReadyRef` is set.

## [0.15.3-alpha] - 2026-05

### Fixed — Embedded album playlist display

- Playlist placeholders show manifest title, artist, album, and genre before full track load.
- Background metadata prefetch loads cover art and HEAD durations for all queued embedded tracks.
- Create album package retains album year from embedded `.mp5p` manifest.

## [0.15.2-alpha] - 2026-05

### Fixed — Embedded album hotfix follow-up

- Album cover from first embedded track via metadata prefix parser (no full-file parse).
- Track durations in Album Details use HEAD sample count (fixes ~half-duration display for stereo).
- Playback overlap: serialized audio start, Play Album stops prior transport before queueing.

## [0.15.1-alpha] - 2026-05

### Fixed — Batch album / embedded MP5P hotfix

- Batch album metadata fields stay responsive after conversion (cached MP5 summaries, deferred preview, album title applied at export).
- Embedded album cover from first track when manifest has no album cover (fragment prefix read only).
- Play album queues all embedded tracks lazily; playback state and Play/Pause stay in sync (no overlap).
- Track duration display uses plausible manifest ms with HEAD fallback.

## [0.15.0-alpha] - 2026-05

**Status:** Experimental alpha — public Beta readiness / app polish; no format or codec changes.

### Added

- Welcome onboarding card (dismissible, localStorage); Demo guide paths A–E on Demo tab.
- Landing `.mp5` / `.mp5p` format explainer; “What works today” in Learn More.
- Embedded album demo fixture on hosted deploy; `importAlbumPackageToPlayer` helper.
- [`MP5_MANUAL_QA_CHECKLIST.md`](docs/MP5_MANUAL_QA_CHECKLIST.md); updated [`MP5_BETA_READINESS.md`](docs/MP5_BETA_READINESS.md).
- Diagnostics: app version, stem worker status, known-issues links.
- E2e: demo guide, onboarding smoke.

### Changed

- Mobile min tap targets (40px) for tabs and primary buttons.
- Expanded user-facing error copy for embedded tracks and stem worker fallback.

## [0.14.0-alpha] - 2026-05

**Status:** Experimental alpha — embedded album / MP5P UX polish; no format or codec policy changes.

### Added

- Polished album package view (cover, metadata, integrity, size warnings, album details panel).
- Tracklist badges and per-track Play / Queue / Extract actions.
- Lazy embedded track loading with loading status; album context in Now Playing.
- Save-to-library confirmations; Saved albums for manifest + embedded packages.
- Batch album export summary with Open in Player, Save to Library, Download again.
- Tests: expanded `tests/albumPackage.test.ts`; expanded `e2e/embedded-album-package.spec.ts`.

## [0.13.1-alpha] - 2026-05

**Status:** Experimental alpha — acceptance gate hardening only; no product behavior changes.

### Changed

- Playwright: serial workers + one retry under `CI=1`; shared `waitForPlaybackProgress` / `waitForSeekReady` helpers in playback e2e.
- Karaoke, playback-regression, stems, and highlights e2e use transport status + progress polls instead of tight fixed timeouts.
- Documented parallel e2e WASM/stem worker contention in `MP5_KNOWN_ISSUES.md`.

## [0.13.0-alpha] - 2026-05

**Status:** Experimental alpha — MP5-L v3 recommended; MP5-C/MP5-H experimental. Not production-ready. MP5 does not claim to beat MP3, AAC, Opus, or FLAC.

### Added

- Batch album export in Converter: metadata table, track reorder, manifest or embedded `.mp5p` from batch queue.
- Tests: `tests/batchAlbumBuilder.test.ts`, `e2e/batch-album-builder.spec.ts`.
- Open-source maintainer docs: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, GitHub Actions CI.
- Root `LICENSE` (MIT), `RELEASE_CHECKLIST.md`, `CHANGELOG.md`, and [`docs/GITHUB_RELEASE_v0.13.0-alpha.md`](docs/GITHUB_RELEASE_v0.13.0-alpha.md).

### Changed

- README polish: badges, table formatting, alpha status, security, and contributing links.
- Root acceptance logs moved to `logs/acceptance/` (generated artifacts, gitignored).
- Test split: `pnpm test` / `pnpm test:unit` (safe unit suite) vs `pnpm test:compatibility` (fixture generation + `compatibilityPass` tests).
- E2E CI generates synthetic compatibility fixtures before Playwright runs.

See [`docs/MP5_ALPHA_RELEASE_NOTES.md`](docs/MP5_ALPHA_RELEASE_NOTES.md) for full alpha release history.

## Earlier alpha releases

Detailed notes for v0.12.x, v0.11.x, v0.10.x, and earlier milestones are in:

- [`docs/MP5_ALPHA_RELEASE_NOTES.md`](docs/MP5_ALPHA_RELEASE_NOTES.md)
- [`docs/CURRENT_MP5_STATUS.md`](docs/CURRENT_MP5_STATUS.md)

[Unreleased]: https://github.com/cjocollin/MP5-audio/compare/v0.20.0-beta...HEAD
[0.20.0-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.19.0-beta...v0.20.0-beta
[0.19.0-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.18.0-beta...v0.19.0-beta
[0.18.0-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.17.1-beta...v0.18.0-beta
[0.17.1-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.17.0-beta...v0.17.1-beta
[0.17.0-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.16.2-beta...v0.17.0-beta
[0.16.2-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.16.1-beta...v0.16.2-beta
[0.16.1-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.16.1-beta-candidate...v0.16.1-beta
[0.16.1-beta-candidate]: https://github.com/cjocollin/MP5-audio/compare/v0.16.0-beta-candidate...v0.16.1-beta-candidate
[0.16.0-beta-candidate]: https://github.com/cjocollin/MP5-audio/compare/v0.15.7-alpha...v0.16.0-beta-candidate
[0.15.7-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.6-alpha...v0.15.7-alpha
[0.15.6-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.5-alpha...v0.15.6-alpha
[0.15.5-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.4-alpha...v0.15.5-alpha
[0.15.4-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.3-alpha...v0.15.4-alpha
[0.15.3-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.2-alpha...v0.15.3-alpha
[0.15.2-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.1-alpha...v0.15.2-alpha
[0.15.1-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.0-alpha...v0.15.1-alpha
[0.15.0-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.14.0-alpha...v0.15.0-alpha
[0.14.0-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.13.1-alpha...v0.14.0-alpha
[0.13.1-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.13.0-alpha...v0.13.1-alpha
[0.13.0-alpha]: https://github.com/cjocollin/MP5-audio/releases/tag/v0.13.0-alpha
