# MP5-C High hiss investigation

**Status:** Blocker addressed (metrics + retune + default change). Confirm by ear on fresh exports.

## Run diagnostics

```bash
pnpm bench:hiss-investigation   # → benchmarks/real-music/HISS_INVESTIGATION.md
pnpm export:origami-listening    # fresh A/B files on Desktop
pnpm wasm:build                  # after quant changes
```

## Summary

| Question | Answer |
|----------|--------|
| Hiss in High v4? | **Yes** — same quant floor as v5/v5.1 (not packing) |
| Hiss in High v5 / v5.1? | **Yes** — identical to v4 on flat path |
| Hiss in Extreme? | **Less** — finer step (0.012); still not transparent vs PCM |
| Introduced by v5 packing? | **No** — lossless on coefficients |
| Introduced by v5.1 bands? | **No** — <0.2% band frames on ORIGAMI |
| Worst sections | Outro, reverb tails, intro gaps, quiet under −42 dBFS |
| Cause | Scalar quant step too coarse for quiet HF tails; full-song SNR misleading |

## Artifact metrics (beyond SNR)

Implemented in `rust/mp5-codec/src/mp5c/artifact.rs`:

- Quiet-window SNR (−42 dBFS gate)
- Quiet noise floor (error RMS / signal RMS, dB)
- HF / LF error RMS
- Mid/side error RMS
- Worst 1-second sliding SNR
- Four-band spectral error ratio
- Per-section tables (intro, vocals, dense, outro, reverb tail, wide stereo)

## Changes made

1. **High quant retune:** base step `0.018` → `0.014`; stronger quiet `adaptive_step_scale` (finer in gaps).
2. **Default preset:** **Extreme** in converter/player (was High).
3. **Bug fix:** `encode_v4_reference` writes version byte `4`.
4. **No band-heuristic changes** (per milestone scope).

## Before / after High (ORIGAMI)

| | Before | After retune |
|---|--------|--------------|
| Full SNR | 36.4 dB | 38.6 dB |
| Quiet SNR | 0.7 dB | 2.6 dB |
| Ratio (v5) | 0.955× | 0.968× |

Extreme: 39.9 dB full, 3.8 dB quiet SNR, ~0.973× — still best MP5-C preset for hiss.

## Ear validation checklist

Re-export and A/B in the player:

1. PCM fallback
2. Extreme v5.1 (default)
3. High v5.1 (retuned quant)
4. Standard v5 (expect more hiss)

If retuned High is clean enough, we can move default back to High; do **not** relax v5.1 band heuristics until this passes by ear.
