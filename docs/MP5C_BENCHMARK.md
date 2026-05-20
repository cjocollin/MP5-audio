# MP5-C experimental benchmark

MP5-C is an **experimental** scalar-quantization codec. It does **not** target MP3/AAC/Opus/FLAC performance.

## Run benchmarks

```bash
# Synthetic fixtures (Rust)
pnpm bench:mp5c

# Real FLAC/WAV sources (see benchmarks/real-music/manifest.json)
pnpm bench:real-music

# Fresh ORIGAMI listening set + LISTENING_VALIDATION.md
pnpm export:origami-listening

# Inspect any .mp5
pnpm inspect:mp5 "path/to/file.mp5"

# WASM parity (subset, via Vitest)
pnpm test tests/mp5cBenchmark.test.ts
```

Report output is also written to `test-fixtures/mp5c-bench-report.txt` when using `pnpm bench:mp5c`.

## Bitstream versions

| Version | Magic | Notes |
|---------|-------|--------|
| v2 | `0x43 0x02` | Legacy; 1152-sample frames, dense i16 payloads |
| v3 | `0x43 0x03` | Mid/side + fixed step (legacy; may hiss on dense masters) |
| v4 | `0x43 0x04` | L/R stereo, adaptive step — listening-validated |
| v5 | `0x43 0x05` | v4 quant + pred2/RLE/split4/golomb/bitpack; `encode_v5_reference` for benches |
| v5.1 | `0x43 0x06` | **Current encoder** — band quant + safe M/S + flat v5 pack |

Decoder supports **v2–v5.1**. Re-convert after `pnpm wasm:build`.

```bash
pnpm bench:v5-compare    # ORIGAMI v4 vs v5
pnpm bench:v51-compare   # ORIGAMI v5 vs v5.1
pnpm bench:hiss-investigation   # artifact / quiet / HF metrics
```

## Why Extreme can exceed PCM size

On **short** or **high-entropy** material (sine, white/pink noise), v3 may be larger than PCM because:

1. **Per-frame headers** (3 bytes × channels × frames) — hurts on sub-second clips.
2. **2048-sample frames** — minimum payload still scales with quantized coefficients.
3. **Noise** does not rice-compress well; dense i16 payloads ≈ raw frame PCM.
4. **Extreme** uses a fine quantizer step (quality over size).

On **30s music-like** fixtures, **Low ~0.29×**, **Standard ~0.33×**, **High ~0.59×**, **Extreme ~0.76×** vs PCM (see latest bench report).

## Recommended default preset (real music)

**Extreme** — converter default after hiss investigation (~40 dB SNR, best quiet metrics). **High** retuned (~38.6 dB); ear-test before promoting back to default.

**Standard** — cleaner than v3 Standard (+8 dB SNR) but only modestly smaller than PCM; may still hiss on very dense material — not the default.

See `benchmarks/real-music/listening/LISTENING_VALIDATION.md`, `benchmarks/real-music/BEFORE_AFTER_V4.md`, `docs/MP5C_LIMITATIONS.md`, and `docs/MP5C_V5_STRATEGY.md`.
