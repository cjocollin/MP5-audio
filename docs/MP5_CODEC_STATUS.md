# MP5 Codec Status

**Version:** MP5 Audio v0.27.0-beta  
**Source of numbers:** `pnpm audio:quality-report` / `pnpm audio:hiss-report` over the
synthetic fixture set (13 fixtures, stereo, 44.1 kHz). Regenerate locally to refresh.
No copyrighted audio, no telemetry.

> Numbers below are from synthetic fixtures and are **not** a claim that MP5 beats
> MP3, AAC, Opus, FLAC, or WAV.

## Current vNext size stack (new)

Protect **1.5** + lossy coalesce + lossless L/B coalesce + preferred **High** loud preset.
Measured with `pnpm audio:hiss-report` (synthetic) and real-track A/B:

| Fixture | Mode | ×PCM | Quiet/tail | Hiss risk |
|---------|------|-----:|:----------:|:---------:|
| reverb_tail | no-coalesce Extreme | 0.503 | ∞ / ∞ | low |
| reverb_tail | **L/B+lossy coalesce High/Extreme** | **0.420** | ∞ / ∞ | **low** |
| dense_music | Extreme (lossy coalesce) | 0.971 | — | n/a |
| dense_music | **High (lossy coalesce)** | **0.941** | — | n/a |

**Public `CodecId.MP5C2`** is Converter lab/advanced only (batch stays MP5-L). Residual 2048 pad
after coalesce is ~0.6% → no short-frame trim. **MP5-L packed Rice** (~46% residual-payload
savings vs varint) + 4-mode stereo remain the default path.

## v0.27.0-beta native Rust vNext (new)

The winning **vNext "smooth"** engine (sub-block + per-band + hysteresis lossless fallback) was
ported into the **native Rust codec** as `mp5c2` and exposed via additive WASM functions
`encode_mp5c_vnext` / `decode_mp5c_vnext`. It is **bit-identical to the JS lab prototype**
(parity SNR = ∞ on every fixture), reaches `reverb_tail` hiss risk **low**, and keeps
silence/quiet bit-exact — now at native speed. Done safely and additively:

- The existing **MP5-C (v5.1) encode/decode is byte-identical** — `mp5c` was not modified, and
  the full JS + Rust suites pass against the rebuilt WASM (regression proof).
- The vNext stream uses a **distinct `0x43 0x34` magic**, is **not** a valid MP5-C stream, and
  the MP5-C / vNext decoders reject each other's containers.
- **`CodecId.MP5C2 = 5`** is assigned for gated Converter lab/advanced export + player decode;
  default and batch export remain MP5-L. Protect-scale **1.5** is the shipping threshold set
  (real-track hiss risk **low** at ~0.97× PCM; see [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md)).
- It remains **lab-only, default OFF**; further size cuts must keep hiss risk low.

## v0.24 vNext hysteresis/lookahead

Adding a **hysteresis + lookahead decay latch** (`mp5c2-smooth-extreme`) took `reverb_tail` to
hiss risk **low** — quiet *and* tail windows bit-exact — at a size slightly smaller than the v0.23
result ([MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md)). A **noise-shaping** experiment
(`mp5c2-shaped-extreme`, JS pre/de-emphasis) was tried and measured **worse** (tail SNR 33 → 27 dB)
and rejected with data — real shaping belongs in the quantizer (a from-scratch transform-domain
codec). vNext stays lab-only, default OFF, never written to `.mp5`, not in the Converter.

## v0.23 vNext sub-block / per-band

vNext moved from block-granular to **sub-block (~23 ms) + per-band** quiet protection
([MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md)). On `reverb_tail` this took the prototype from
hiss risk **high → medium** (quiet-window SNR 12.6 → ∞, quiet windows now bit-exact; lossless
coverage 56.7% → 74.5%). silence/quiet_sine stay bit-exact; loud fixtures get 0% fallback (no
waste). Honest size cost: fine sub-blocks pad to the 2048 MP5-C frame, so loud material can
exceed 1× PCM (dense_music ~1.17×) — which is why **compression stays secondary and vNext is
still lab-only, default OFF, never written to `.mp5`.**

## v0.22 hiss audit (root cause)

The [MP5-C Hiss Audit](MP5C_HISS_AUDIT.md) pinned the root cause: **MP5-C quantizes in the
time domain with a step that is a fixed fraction of full-scale (no MDCT/transform)**, so its
error is broadband hiss that loud passages mask but quiet passages expose. Measured on a
real commercial track (decoded MP5-L as ground truth): **MP5-C High = 24.3 dB tail SNR
(hiss risk: high) at 0.968× PCM — *larger* than the MP5-L lossless file (0.871×)**. The
**MP5-C vNext** prototype (lossless fallback for quiet blocks) takes silence and
sustained-quiet to bit-exact and roughly doubles reverb-tail quiet SNR, but block-granular
detection leaves decaying tails partly lossy — still lab-only. See
[MP5C_VNEXT_PLAN.md](MP5C_VNEXT_PLAN.md).

## Summary

| Mode | Role | Lossless | Avg size ×PCM | Status |
|------|------|----------|---------------|--------|
| **MP5-L v3** | **Default / recommended** | **Bit-exact (13/13)** | ~0.50× | ✅ Clean, default |
| MP5-C (Standard/High/Extreme) | Lab / research | No (lossy) | ~0.52–0.61× | ⚠️ Lab-only — hiss |
| MP5-H High + CORR | Hybrid | Sample-exact content (13/13) | ~1.13× (often >1×) | Optional, large, not default |
| **MP5-C vNext (`CodecId` 5)** | **Lab/advanced export** | Quiet/fragile bit-exact | ~0.42–0.94× (High) | 🧪 Gated; hiss low @ protect 1.5; prefer High preset for size |
| PCM | Reference / debug | Bit-exact | 1.00× | Reference |

## MP5-L (default, lossless)

- **Bit-exact on every fixture** (samples *and* length); null test = digital silence.
- No introduced hiss, no clipping, no duration drift.
- Sizes range from 0.002× PCM (silence) to ~0.75× (dense music); average ~0.50×.
- **Packed Rice (landed):** `FLAG_RICE_PACKED = 6` encodes LPC residuals with bit-packed
  partitioned Rice; legacy `FLAG_RICE = 3` remains LPC+**varint** for older files. Encoder
  picks the smaller verified payload. Go/no-go corpus: ~46% residual-payload savings vs varint.
  Also: rice-cost-aware LPC order selection and FLAC-style 4-mode stereo (L/R, M/S, L/S, R/S).
- **Decision: MP5-L remains the recommended default.** Further compression experiments
  (adaptive block size, LPC selection, RLE) are allowed only if they keep every bit-exact
  gate green.

## MP5-C (lab-only, lossy) — why it still hisses

MP5-C uses transform-domain scalar quantization. The lab pinpoints the hiss:

- On **`reverb_tail`**, full-song SNR looks acceptable (Standard ~26 dB, High
  ~31 dB, Extreme ~32 dB) but **quiet-window SNR collapses to ~2.6 / 4.8 / 5.7 dB**.
  That low quiet-window number is the audible tail hiss — the quantization noise
  floor does not scale down with the signal in decaying passages.
- On **`quiet_sine`** (-40 dBFS), SNR is only ~5–13 dB across presets — coarse
  global quantization swamps low-level tones.
- True digital **silence** decodes to silence (no residual), and **hot masters do
  not clip** in these fixtures.
- Least-bad preset for quiet material: **Extreme** (finest step), but it is still
  not headphone-clean and barely smaller than PCM on loud material.

**Verdict:** MP5-C remains **lab-only / experimental**. The design is not
fundamentally broken, but global scalar quantization without per-band noise
shaping or a lossless quiet-frame fallback cannot reach headphone-clean on quiet
passages. Judge it by quiet-window + worst-1s SNR and the null test — never by
full-song SNR alone.

## MP5-H (hybrid, large)

- Base = MP5-C; with the **CORR** correction layer applied, output is
  **sample-exact content on every fixture** (the lossless restore works).
- Raw decoded stream is frame-padded; the container trims to `totalSamples`, so
  this is not playback drift.
- **Size is large** — averages ~1.13× PCM and exceeds 1× on loud/dense material
  (e.g. ~1.79–1.80× on `loud_sine` / `dense_music`) because it carries both a
  lossy base and a lossless correction.
- **Decision: MP5-H stays optional/experimental, not default.** It would only
  become a default candidate if it were both clearly smaller than MP5-L *and*
  bit-exact — currently it is neither.

## MP5-C vNext prototype (`mp5c2-lab`) — lab-only, default OFF

An experimental path that implements the milestone's "hybrid lossless fallback
for quiet frames" idea. It splits audio into blocks and encodes **quiet/silent
blocks losslessly (MP5-L)** while keeping **MP5-C for loud blocks**. It is **never
written to `.mp5`** and **not wired into the converter**.

Measured against current MP5-C:

| Fixture | Metric | MP5-C High | MP5-C vNext |
|---------|--------|-----------:|------------:|
| `silence` | bit-exact | no | **yes** |
| `quiet_sine` | bit-exact | no | **yes** |
| `reverb_tail` | quiet-window SNR | ~4.8 dB | **~10.6 dB** |
| `silence`/quiet | silence residual peak | 0 | **0** |
| (all) | duration drift | frame-padded | **none (trims)** |

**Gate status (prototype targets):** silence residual near zero ✅; quiet sine no
obvious hiss ✅ (bit-exact); reverb-tail quiet SNR much better than MP5-C ✅; no
clipping ✅; no duration drift ✅.

**Honest limitation:** quiet detection is **block-granular**, so quiet *moments
embedded inside otherwise-loud blocks* (e.g. gaps between drum hits) still get
lossy coding. Finer (sub-block / per-band) decisions and noise-shaped
quantization are the next steps. Size grows because quiet blocks are stored
losslessly — acceptable under "quality before compression," but it is not a
shipping codec.

## What did **not** change

- MP5-L is still default/recommended; MP5-C is still not default.
- No public MP5-L/MP5-C/MP5-H policy change.
- No telemetry, no DRM, no AI, no mainstream-codec claims.
- Existing MP5 / MP5P files and the playback regression harness are untouched.

See [MP5_AUDIO_QUALITY_LAB.md](MP5_AUDIO_QUALITY_LAB.md) for how to reproduce
every number here.
