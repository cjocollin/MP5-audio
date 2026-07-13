# MP5 Audio Quality Lab (`tools/audio-lab`)

A repeatable, honest measurement + listening harness for the MP5 audio modes.
It drives the **prebuilt MP5 codec WASM** (`apps/web/src/wasm/pkg`) over synthetic
fixtures (and optional local files), and writes CSV / JSON / Markdown reports to
`benchmarks/audio-quality/`.

> **Philosophy: quality before compression.** Full-song SNR is reported but is
> misleading on its own. Judge MP5-C / MP5-H by **quiet-window SNR**, **silence
> residual**, and **worst-1s SNR**.

No telemetry. No network. No copyrighted audio — fixtures are generated in code,
and any local source you point at is git-ignored and never committed.

## Commands

```bash
pnpm audio:bench            # all modes, all synthetic fixtures
pnpm audio:bench:mp5l       # PCM + MP5-L only
pnpm audio:bench:mp5c       # PCM + MP5-C presets + MP5-C vNext prototype
pnpm audio:bench:mp5c-vnext # PCM + MP5-C presets + vNext High/Extreme
pnpm audio:bench:mp5h       # PCM + MP5-L + MP5-H
pnpm audio:quality-report   # aggregate per-mode verdicts (QUALITY_REPORT.md)
pnpm audio:null-test        # original PCM vs decoded — confirms MP5-L digital silence
pnpm audio:export-listening # WAV listening set, descriptive names (git-ignored)
pnpm audio:export-listening:vnext  # PCM + MP5-L + MP5-C + vNext High/Extreme
pnpm audio:hiss-report      # hiss matrix + Hiss Risk (MP5C_HISS_REPORT.md, git-ignored)
pnpm audio:gates            # the vitest quality gates (also part of `pnpm test`)
```

### Comparing exported `.mp5` files

`mp5file.mjs` decodes a `.mp5` through the app's authoritative contract (parse → matching
WASM decoder → trim to `totalSamples`), proven by `selfTest()` before any number is trusted.
`compare.mjs` scores candidates against a reference (typically MP5-L lossless = ground truth).

```bash
pnpm audio:inspect       --files "<a.mp5>" "<b.mp5>"      # structural; or bare with lab.config.json
pnpm audio:compare-files --reference "<ref.mp5>" --candidate "<cand.mp5>"
pnpm audio:compare-set   --reference "<ref.mp5>" --candidates "<a.mp5>" "<b.mp5>"
```

Set `referenceMp5` + `candidateMp5` in the git-ignored `lab.config.json` to run the bare
commands. There is **no resampler**: a sample-rate mismatch is skipped with a clear message.

Each command requires the codec WASM to exist. If you see
`MP5 codec WASM not found`, run `pnpm wasm:build` first.

## Testing against your own files (never committed)

The lab reads **WAV** (16/24-bit PCM or 32-bit float). Convert FLAC/MP3 to WAV first.

```bash
pnpm audio:bench --source "C:/path/to/song.wav"
pnpm audio:export-listening --source "C:/path/to/song.wav"
```

Or copy `lab.config.example.json` → `lab.config.json` (git-ignored), list your
local files, and use `--source @config`:

```bash
pnpm audio:bench --source @config
```

## Metrics (see `metrics.mjs`)

| Metric | Meaning |
|--------|---------|
| `bitExact` | identical samples **and** identical length |
| `contentBitExact` | every overlapping sample matches (raw stream may be frame-padded) |
| `fullSnrDb` | whole-signal SNR — **misleading alone** |
| `quietWindowSnrDb` | SNR over the quietest 100 ms windows (< -40 dBFS) — exposes hiss |
| `worst1sSnrDb` | lowest SNR over any audible 1 s window |
| `silenceResidualPeak/Rms` | decoded energy where the source is exactly silent |
| `rmsError` / `peakError` | normalized error magnitudes |
| `noiseFloorDbfs` | error RMS in dBFS |
| `clippingCount` | decoded samples at full-scale |
| `stereoCorrError` | change in L/R correlation |
| `hfErrorRms` | RMS of the high-pass-emphasised error |

## Files

- `fixtures.mjs` — 13 synthetic fixture categories (silence … dense music).
- `metrics.mjs` — core metrics + null-test (pure JS, no deps).
- `hiss.mjs` — hiss-specific metrics + Hiss Risk thresholds.
- `mp5file.mjs` — `.mp5` → PCM decode contract + self-test.
- `compare.mjs` — inspect / compare / hiss-report builders.
- `codecs.mjs` — mode table (PCM, MP5-L, MP5-C presets, MP5-H, **MP5-C vNext block + sub-block + per-band**).
- `wav.mjs` — minimal WAV read/write for listening + `--source`.
- `report.mjs` — CSV / JSON / Markdown writers.
- `run.mjs` — CLI entry point.

## MP5-C vNext (lab prototype — not a real export mode)

The `mp5c2-*` modes are **experimental, default-OFF** prototypes that are **never written to
`.mp5`**, **not in the Converter**, and emit **WAV listening previews only**. They test future
MP5-C ideas before any real format version is chosen:

- `mp5c2-lab` / `mp5c2-extreme` — block-level lossless fallback (frozen baseline).
- `mp5c2-subblock` — per-1024-frame (~23 ms) lossless/lossy decision.
- `mp5c2-bandquiet` / `mp5c2-bandquiet-extreme` — sub-block **+ per-band** escalation for quiet
  high-frequency tails. **Best quality:** takes `reverb_tail` to hiss risk *medium* with
  bit-exact quiet windows.

Reports show **protected %** (share of samples coded losslessly; L = broadband-quiet, B =
per-band fragile tail) and the active thresholds. See
[`docs/MP5C_VNEXT_RESULTS.md`](../../docs/MP5C_VNEXT_RESULTS.md) and
[`docs/MP5C_VNEXT_PLAN.md`](../../docs/MP5C_VNEXT_PLAN.md). Honest size cost: fine sub-blocks
pad lossy units to the 2048 MP5-C frame, so loud material can exceed 1× PCM — compression stays
secondary.
