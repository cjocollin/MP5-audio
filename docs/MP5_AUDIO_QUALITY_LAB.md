# MP5 Audio Quality Lab

**Version:** MP5 Audio v0.21.0-beta  
**Scope:** audio correctness, measurement, listening reports, and safe codec experimentation.  
**Philosophy:** **quality before compression.**

The Audio Quality Lab is a repeatable harness for auditing and improving the MP5
audio modes (MP5-L, MP5-C, MP5-H, PCM) **without** destabilizing MP5-L or public
playback. It lives in [`tools/audio-lab/`](../tools/audio-lab/) and writes reports
to [`benchmarks/audio-quality/`](../benchmarks/audio-quality/).

It is **not** an app feature. There is no AI, no DRM, no telemetry, and no network.
Synthetic fixtures are generated in code; any local file you point it at is
git-ignored and never committed.

## What it does

- Generates 13 synthetic fixture categories (no copyrighted audio).
- Drives the prebuilt codec WASM (`apps/web/src/wasm/pkg`) for encode/decode.
- Computes an honest metric set per fixture × mode.
- Runs null tests (original PCM vs decoded output).
- Exports small WAV listening sets (git-ignored).
- Emits CSV / JSON / Markdown reports.

## Commands

| Command | Output |
|---------|--------|
| `pnpm audio:bench` | `report-all.{json,csv,md}` — all modes, all fixtures |
| `pnpm audio:bench:mp5l` | PCM + MP5-L only |
| `pnpm audio:bench:mp5c` | PCM + MP5-C presets + MP5-C vNext |
| `pnpm audio:bench:mp5h` | PCM + MP5-L + MP5-H |
| `pnpm audio:bench:mp5c-vnext` | PCM + MP5-C presets + MP5-C vNext High/Extreme |
| `pnpm audio:quality-report` | `QUALITY_REPORT.md` — per-mode verdicts |
| `pnpm audio:quality-report:mp5c` | quality report scoped to MP5-C + vNext |
| `pnpm audio:null-test` | `NULL_TEST.md` + `null-test.json` |
| `pnpm audio:export-listening` | `listening/<fixture>/<descriptive>.wav` (git-ignored) |
| `pnpm audio:export-listening:mp5c` | listening set: PCM + MP5-L + MP5-C High/Extreme |
| `pnpm audio:export-listening:vnext` | listening set: PCM + MP5-L + MP5-C + **vNext High/Extreme** |
| `pnpm audio:inspect` | structural inspect of `.mp5` files → git-ignored `local/` report |
| `pnpm audio:compare-files` | one candidate `.mp5` vs a reference `.mp5` |
| `pnpm audio:compare-set` | many candidates vs a reference `.mp5` |
| `pnpm audio:hiss-report` | `MP5C_HISS_REPORT.md` — hiss matrix + Hiss Risk + optional reference |
| `pnpm audio:gates` | the vitest quality gates (also part of `pnpm test`) |

Add `--source "C:/path/to/file.wav"` (16/24-bit or float WAV) to test your own
local material, or `--source @config` to use `tools/audio-lab/lab.config.json`
(copy from `lab.config.example.json`; git-ignored). Convert FLAC/MP3 to WAV first
— the lab never decodes or commits copyrighted source audio.

### Comparing exported `.mp5` files

`compare-files` / `compare-set` / `inspect` decode `.mp5` containers through the
authoritative contract in `mp5file.mjs` (parse → matching WASM decoder → **trim to
`totalSamples`**), proven by a self-test that round-trips an MP5-L container bit-exact
before any number is reported. There is **no resampler**: on sample-rate mismatch a
candidate is skipped with a clear message.

```bash
pnpm audio:compare-files --reference "<local>/track (MP5-L v3).mp5" --candidate "<local>/track (MP5-C High).mp5"
pnpm audio:compare-set --reference "<ref.mp5>" --candidates "<a.mp5>" "<b.mp5>" "<c.mp5>"
pnpm audio:inspect --files "<a.mp5>" "<b.mp5>"        # or set referenceMp5/candidateMp5 in lab.config.json and run bare
```

`@config` (the git-ignored `lab.config.json`) can supply `referenceMp5` + `candidateMp5`
so the bare commands work without typing local paths.

## Lab mode matrix

| Mode | CLI (bench/listening id) | Output | Writes real `.mp5`? | Lab-only | Listening-safe | Recommendation |
|------|--------------------------|--------|:-------------------:|:--------:|:--------------:|----------------|
| PCM reference | `pcm` | `pcm_reference.wav` | No | debug | yes | reference only |
| MP5-L | `mp5l` | `mp5l.wav` | **Yes (public default)** | no | **yes** | **default/recommended** |
| MP5-C High | `mp5c-high` | `mp5c_current_high.wav` | Yes (legacy public) | yes | **no (hiss)** | lab-only |
| MP5-C Extreme | `mp5c-extreme` | `mp5c_current_extreme.wav` | Yes (legacy public) | yes | **no (hiss)** | lab-only |
| MP5-C vNext block High | `mp5c2-lab` | `mp5c_vnext_block_high.wav` | **No (prototype)** | yes | experimental | frozen baseline |
| MP5-C vNext block Extreme | `mp5c2-extreme` | `mp5c_vnext_block_extreme.wav` | **No (prototype)** | yes | experimental | frozen baseline |
| MP5-C vNext sub-block High | `mp5c2-subblock` | `mp5c_vnext_subblock_high.wav` | **No (prototype)** | yes | experimental | sub-block detection |
| MP5-C vNext sub-block+band High | `mp5c2-bandquiet` | `mp5c_vnext_bandquiet_high.wav` | **No (prototype)** | yes | experimental | v0.23 |
| MP5-C vNext sub-block+band Extreme | `mp5c2-bandquiet-extreme` | `mp5c_vnext_bandquiet_extreme.wav` | **No (prototype)** | yes | experimental | v0.23 |
| MP5-C vNext smooth High | `mp5c2-smooth` | `mp5c_vnext_smooth_high.wav` | **No (prototype)** | yes | experimental | +hysteresis |
| MP5-C vNext smooth Extreme | `mp5c2-smooth-extreme` | `mp5c_vnext_smooth_extreme.wav` | **No (prototype)** | yes | experimental | **best (reverb_tail → low)** |
| MP5-C vNext shaped Extreme | `mp5c2-shaped-extreme` | `mp5c_vnext_shaped_extreme.wav` | **No (prototype)** | yes | experimental | noise-shaping experiment (rejected) |
| MP5-C vNext native Extreme | `mp5c2-native-extreme` | `mp5c_vnext_native_extreme.wav` | **No (prototype)** | yes | experimental | **native Rust port of smooth** (`encode_mp5c_vnext`) |
| MP5-H High | `mp5h-high` | `mp5h_high.wav` | Yes | yes | yes | optional, large |
| MP5-H Extreme | `mp5h-extreme` | `mp5h_extreme.wav` | Yes | yes | yes | optional, large |

**MP5-C vNext is not a normal MP5 export mode.** It is the lab modes `mp5c2-*`, which emit
**WAV listening previews only — never `.mp5`** — and are not in the Converter. They exist to
test future MP5-C ideas (block → sub-block → per-band quiet protection) before any real format
version is chosen. See [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md),
[MP5C_HISS_AUDIT.md](MP5C_HISS_AUDIT.md), [MP5C_VNEXT_PLAN.md](MP5C_VNEXT_PLAN.md).

## How to hear vNext

```bash
pnpm audio:export-listening:vnext                       # synthetic fixtures → listening/<fixture>/*.wav
pnpm audio:export-listening:vnext --source "C:\path\to\song.wav"   # your local WAV → local-listening/<name>/*.wav
pnpm audio:hiss-report                                  # quiet/tail SNR + Hiss Risk + protected %
pnpm audio:compare-set                                  # the 5 reference .mp5 vs MP5-L (uses lab.config.json)
```

Outputs (all git-ignored):
- `benchmarks/audio-quality/listening/<fixture>/` — synthetic previews (e.g. `mp5c_vnext_bandquiet_extreme.wav`).
- `benchmarks/audio-quality/local-listening/<source>/` — previews for your `--source` WAV.
- `benchmarks/audio-quality/local/` — local reference inspection report.

A/B the files in each folder against `mp5l.wav` (clean) and `mp5c_current_high.wav` (hiss). To
hear vNext on the real reference track, decode its MP5-L to WAV first, then pass it via `--source`.

## Fixture categories

`silence`, `quiet_sine` (-40 dBFS), `loud_sine`, `swept_sine` (50 Hz→18 kHz),
`pink_noise`, `white_noise`, `impulse`, `kick_snare`, `bass_loop`, `vocal_like`,
`stereo_width`, `reverb_tail` (decay to near-silence), `dense_music`.

The two that matter most for the MP5-C hiss problem are **`quiet_sine`** and
**`reverb_tail`**, because they expose noise that loud material masks.

## Metrics and how to read them honestly

| Metric | Meaning | Honest reading |
|--------|---------|----------------|
| `bitExact` | identical samples **and** length | the only true "lossless" pass |
| `contentBitExact` | every overlapping sample matches | raw stream may be frame-padded; container trims |
| `fullSnrDb` | whole-signal SNR | **misleading alone** — loud content hides quiet hiss |
| `quietWindowSnrDb` | SNR over the quietest 100 ms windows (< -40 dBFS) | the real hiss detector |
| `worst1sSnrDb` | lowest SNR over any audible 1 s window | worst-case listening moment |
| `silenceResidualPeak/Rms` | decoded energy where the source is exactly silent | should be 0 for lossless |
| `rmsError` / `peakError` | normalized error magnitudes | overall distortion |
| `noiseFloorDbfs` | error RMS in dBFS | added noise floor |
| `clippingCount` | decoded samples at full scale | codec-introduced clipping |
| `stereoCorrError` | change in L/R correlation | imaging damage |
| `hfErrorRms` | RMS of high-pass-emphasised error | treble damage |

> **Why full-song SNR lies:** on `reverb_tail`, MP5-C posts a respectable
> full-song SNR (~26–31 dB) while its **quiet-window SNR collapses to ~2–6 dB** —
> that low number is the audible tail hiss. Always read quiet-window SNR, silence
> residual, and the null test alongside full-song SNR.

## Null test

`pnpm audio:null-test` subtracts decoded output from the original PCM and reports
max diff, RMS diff, non-zero sample count, and whether the result is digital
silence. Expectations:

- **MP5-L** → digital silence (max diff 0) on every fixture.
- **MP5-H + CORR** → max diff 0 / non-zero 0 (sample-exact content; the raw base
  stream is frame-padded, so the length-checking "digital silence" flag may read
  `—` even though the error null is perfect — the container trims to `totalSamples`).
- **MP5-C** → non-zero (lossy), with the worst windows surfaced.
- **MP5-C vNext** → digital silence on silent/sustained-quiet fixtures.

## Safety guarantees

- MP5-L stays the default and bit-exact; the gates fail loudly if that regresses.
- The MP5-C vNext prototype is **lab-only, default OFF**, and **never written to
  `.mp5`** — it composes existing encoders inside this harness only.
- No mainstream-codec comparison claims are produced.
- No copyrighted audio, no telemetry.

See also: [MP5_CODEC_STATUS.md](MP5_CODEC_STATUS.md),
[MP5_LIMITATIONS.md](MP5_LIMITATIONS.md), [MP5_KNOWN_ISSUES.md](MP5_KNOWN_ISSUES.md).
