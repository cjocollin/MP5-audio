# MP5-C v5 compression strategy

**Status:** v5.1 encoder shipped (`0x43 0x06`). MP5-C remains **experimental**. Decoder supports v2–v5.1; v5 reference encode retained for benches.

## What v5 implemented (P0 entropy)

| Technique | Status | Notes |
|-----------|--------|-------|
| Order-1 zigzag delta (Rice) | v4 + v5 | Baseline varint residuals |
| Order-2 predictor (pred2) | **v5** | `FLAG_PRED2` — smaller on smooth frames |
| Golomb-Rice (adaptive k) | **v5** | `FLAG_GOLOMB` — only when max delta ≤ 2048 |
| Adaptive bit-width pack | **v5** | `FLAG_BITPACK` — lossless, coeffs must fit |
| Zero-delta RLE | **v5** | `FLAG_RLE_ZERO` — escape `0xFE` (not `0x00`) |
| 4×512 sub-block split | **v5** | `FLAG_SPLIT4` — when single-block modes tie dense |
| Dense i16 fallback | v4 + v5 | Still needed on high-entropy quant |
| Per-frame adaptive quant step | v4 + v5 | Unchanged — quality preserved |

**Not in v5:** safe M/S, band quant, noise shaping (deferred to v5.1+).

## What v5.1 implemented (P1 band-aware)

| Technique | Status | Notes |
|-----------|--------|-------|
| 4-band cascaded split + merge | **v5.1** | `bands.rs` — exact float merge |
| Per-band quant multipliers | **v5.1** | HF coarser; M/S side +6% |
| Band-aware frame modes | **v5.1** | `FLAG_BAND_LR` (8), `FLAG_BAND_MS` (9) |
| Safe M/S stereo pairs | **v5.1** | Correlation > 0.87, side RMS < 42% mid, size win |
| Quality gates | **v5.1** | `peak_err_limit()` per preset; conservative flat fallback |
| Fast band pack | **v5.1** | `pack_frame_band` — rice/pred2/rle/bitpack/dense only |
| Encode heuristics | **v5.1** | Try band only when flat ≈ dense or quiet RMS; M/S if LR > 6 KB |

**Not in v5.1:** meaningful ORIGAMI ratio gain (heuristics + gates keep ~flat v5 path).

## ORIGAMI full-song results (48 kHz)

See `benchmarks/real-music/V4_VS_V5.md` (`pnpm bench:v5-compare`).

| Preset | v4 ratio / dense% | v5 ratio / dense% | SNR v4→v5 | Clips |
|--------|-------------------|---------------------|-----------|-------|
| Standard | 0.962 / 86.0% | **0.933** / **78.7%** | 32.6 → 32.6 dB | 4754 → 4754 |
| High | 0.974 / 90.0% | **0.955** / **84.5%** | 36.4 → 36.4 dB | 0 → 0 |
| Extreme | 0.982 / 93.0% | **0.971** / **88.2%** | 39.9 → 39.9 dB | 0 → 0 |

- **Dense frame reduction (High):** 90.0% → 84.5% (**−5.5 percentage points**)
- **Size improvement (High):** 0.974× → 0.955× PCM (~**1.9%** smaller file)
- **Quality:** identical SNR and clipping — packing-only change
- **Ratio gate (≤ 0.88× High):** **not met** — residuals on dense electronic masters still near i16 entropy

High v5 frame mix (ORIGAMI): ~765 RLE, ~263 split4, ~13 pred2, ~6125 dense.

## Why dense frames remain

Sampled dense frames: **rice/pred2 payloads are still larger than 4096 B dense** on this material — v5 picks dense correctly. Further gains need **new residual domains** (bands, safe decorrelation), not coarser quant.

## Design principles (unchanged)

1. **Quality floor first** — v5 must not beat v4 SNR on ORIGAMI.
2. **Honest scope** — no claims vs MP3/AAC/Opus/FLAC.
3. **Backward decode** — v2–v5 decode paths in `mp5c::decode`.
4. **Default preset** — **High** for listening.

## ORIGAMI v5 vs v5.1 (48 kHz)

See `benchmarks/real-music/V5_VS_V51.md` (`pnpm bench:v51-compare`).

| Preset | v5 ratio / dense% | v5.1 ratio / dense% | SNR | Band % | M/S % |
|--------|-------------------|---------------------|-----|--------|-------|
| Standard | 0.933 / 78.7% | 0.933 / 78.6% | 32.6 dB (same) | 0.1% | 0% |
| High | 0.955 / 84.5% | 0.955 / 84.4% | 36.4 dB (same) | 0.1% | 0% |
| Extreme | 0.971 / 88.2% | 0.971 / 88.1% | 39.9 dB (same) | 0% | 0% |

- **Size:** no measurable gain on ORIGAMI — band/M/S paths almost never beat flat v5 pack under current gates.
- **Encode cost:** ~3× v5 (~2.7 s vs ~0.8 s full song) — acceptable after perf fix; was hours before `pack_frame_band` + heuristics.
- **Ratio gate (≤ 0.90× High, stretch 0.88×):** **still not met** (0.955×).
- **Quality gates:** SNR ≥ 35.5 dB, 0 clips — **pass**. High remains **default**.

## v5.2+ candidates

| Priority | Technique | Target |
|----------|-----------|--------|
| P1 | Loosen band try heuristic (more frames) | Actually exercise band quant on dense masters |
| P2 | Huffman / shared tables on dense residuals | High ≤ 0.88× at ≥ 35.5 dB |
| P3 | Transient shorter sub-frames | Finer step on attacks only |
| P4 | Noise-shaped HF only | If SNR floor holds |

If size and SNR conflict, **keep SNR**.

## Commands

```bash
pnpm bench:v5-compare     # ORIGAMI v4 vs v5
pnpm bench:v51-compare    # ORIGAMI v5 vs v5.1
pnpm bench:real-music     # manifest windows (current encoder = v5.1)
cargo test -p mp5-codec --release
```
