# MP5-C Hiss Audit

**Version:** MP5 Audio v0.22.0-beta  
**Method:** synthetic fixtures + local "IS THIS A CULT?" reference exports, measured by the
[Audio Quality Lab](MP5_AUDIO_QUALITY_LAB.md). Reproduce with `pnpm audio:hiss-report`.

> No claim is made that MP5 beats MP3, AAC, Opus, FLAC, or WAV. Numbers are from
> synthetic fixtures and one local commercial track; no copyrighted audio is committed.

## TL;DR — root cause

**MP5-C quantizes audio in the *time domain* with a scalar step that is a fixed
fraction of full-scale.** There is **no MDCT / lapped transform** — frames are split
into 4 sub-bands by a cascaded one-pole filterbank ([`mp5c/bands.rs`](../rust/mp5-codec/src/mp5c/bands.rs))
and each band's *time samples* are divided by a step and rounded
([`quant::quantize`](../rust/mp5-codec/src/mp5c/quant.rs)). Time-domain scalar
quantization spreads its error as **broadband white noise** — i.e. hiss. Loud
passages mask it (full-song SNR 30–45 dB); quiet passages, reverb tails, and fades
sit near or below that fixed noise floor (quiet-window SNR 5–25 dB), so the hiss
becomes audible. **Pure silence is exact only because 0 ÷ step rounds to 0.**

## How the current encoder works

- **Domain:** time-domain. `encode_channel_frame` ([`frame_v51.rs:38`](../rust/mp5-codec/src/mp5c/frame_v51.rs))
  works on raw PCM `frame: &[f32]`, optionally split into 4 sub-bands, never transformed.
- **Frame size:** 2048 samples (`FRAME_SIZE_V3`). Bitstream version v5.1 (`0x43`, ver 6).
- **Quantizer:** `q = round(x / step)`, `step = base_step · frame_scale · band_mult · band_scale`.
  - `base_step` ([`quant.rs:24`](../rust/mp5-codec/src/mp5c/quant.rs)): Low 0.10, Standard 0.028, **High 0.014, Extreme 0.012**.
  - `frame_scale` = `adaptive_step_scale(rms, hf)` ([`quant.rs:70`](../rust/mp5-codec/src/mp5c/quant.rs)),
    clamped to **[0.32, 1.0]** — quieter frames get a finer step, but only down to ~3×.
  - `band_step_multipliers` make HF bands coarser (High 1.10–1.28×, Extreme 1.06–1.14×).
- **Stereo:** per-frame L/R vs M/S, M/S only when "safe" (`stereo_ms_safe`: corr > 0.87 and
  small side). Otherwise independent L/R.
- **Frame selection gate:** each frame is accepted under a **peak-error** limit
  (`peak_err_limit`: High 0.013, Extreme 0.011). This bounds *peak* error, **not**
  quiet-passage SNR — a tiny signal trivially passes the peak gate while its SNR is awful.
- **Duration:** frames pad to 2048; the container trims to `totalSamples` (verified
  no playback drift — decoded length matched HEAD on all five reference files).

## Why silence passes but quiet signals hiss

The step is a **fixed fraction of full-scale**, not of the local signal level. For a
−40 dBFS passage (amplitude ≈ 0.01) at High, `step ≈ 0.014 · 0.32 ≈ 0.0045`, so the
quantization error (±step/2 ≈ ±0.0022) is roughly a quarter of the signal → ~13 dB SNR.
`adaptive_step_scale` floors at 0.32×, far too mild to track −40/−50 dBFS material.
Silence is the only level that survives, because exact zero quantizes to exact zero.

## Measured evidence

### Synthetic fixtures (quiet-window SNR exposes what full-song SNR hides)

| Fixture | Mode | Full SNR | Quiet-window SNR | Worst-1s quiet | Hiss risk |
|---------|------|---------:|-----------------:|---------------:|:---------:|
| quiet_sine | MP5-C High | 10.5 | 10.5 | 10.5 | severe |
| quiet_sine | MP5-C Extreme | 13.1 | 13.1 | 13.1 | high |
| reverb_tail | MP5-C High | 30.8 | **4.8** | **0.0** | severe |
| reverb_tail | MP5-C Extreme | 31.7 | **5.7** | **0.0** | severe |
| reverb_tail | MP5-L | ∞ | ∞ | ∞ | low |

Full-song SNR on `reverb_tail` looks fine (~31 dB) while the worst quiet second sits at
**0 dB SNR** (error equals signal). The error spectral flatness in those windows is
high (broadband) — the signature of hiss.

### Local reference — "IS THIS A CULT?" (MP5-L decode as ground truth)

187.2 s, 44.1 kHz stereo, 8,255,488 frames. It is a loud master (no <−40 dBFS windows),
so the **tail-window SNR** (−55…−30 dBFS) is the hiss probe:

| Candidate | ×PCM | Full SNR | Tail SNR | Hiss risk |
|-----------|-----:|---------:|---------:|:---------:|
| MP5-L (reference) | 0.871 | — | — | low |
| MP5-C High | **0.968** | 38.2 | **24.3** | high |
| MP5-C Extreme | **0.978** | 39.5 | **25.6** | medium |
| MP5-H High + CORR | 1.820 | ∞ (sample-exact) | ∞ | low |
| MP5-H Extreme + CORR | 1.811 | ∞ (sample-exact) | ∞ | low |

Two damning facts on real music: **(1)** MP5-C's lossy stream is *larger* than the MP5-L
lossless file (0.968–0.978× vs 0.871×), and **(2)** its low-level passages carry audible
hiss (tail SNR 24–26 dB). MP5-H is genuinely clean (sample-exact with CORR) but ~1.8× PCM.

## Findings checklist (from the milestone)

- **MDCT/transform used?** No — time-domain sub-band filterbank only.
- **Where scalar quantization occurs:** [`quant::quantize`](../rust/mp5-codec/src/mp5c/quant.rs) on time samples, per band.
- **Where the noise floor is introduced:** the fixed `base_step` × mildly-adaptive scale; error is broadband.
- **Why quiet/reverb windows fail:** step does not track signal level below ~−30 dBFS (scale floored at 0.32×).
- **Why silence passes:** exact zero quantizes to zero.
- **Duration/alignment:** stable (frame-padded, container-trimmed; no drift observed).
- **HF damage:** HF bands are intentionally coarser; mild at High/Extreme but contributes to the broadband floor.
- **Stereo width:** per-frame M/S is gated to safe cases; not the primary hiss source.
- **Hot masters:** no clipping introduced; the issue is the noise floor, not headroom.

## Conclusion

MP5-C remains **lab-only**. The architecture is not "broken," but **time-domain scalar
quantization with a full-scale-relative step cannot be headphone-clean on quiet/decaying
material** without either (a) a lossless fallback for fragile passages, or (b) a redesign
toward transform-domain coding with psychoacoustic, signal-relative noise allocation. See
[MP5C_VNEXT_PLAN.md](MP5C_VNEXT_PLAN.md). MP5-L stays the default; MP5-H stays optional/large.

**vNext progress (v0.23):** the lossless-fallback approach (a) was pushed from block-level to
**sub-block + per-band** quiet detection, moving `reverb_tail` from hiss risk severe → **medium**
with bit-exact quiet windows — measured in [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md). It is
still lab-only and not yet clean; redesign (b) remains the long-term path.
