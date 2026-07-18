# MP5-C vNext Results — Sub-block / Per-band / Hysteresis Quiet Detection

**Version:** MP5 Audio v0.27.0-beta  
**Reproduce:** `pnpm audio:hiss-report` (synthetic + optional local reference).

> **TL;DR.** Protect **1.5** + lossy/L/B coalesce keep hiss risk **low**. Prefer **High** loud
> preset for size (`dense_music` **~0.94×**, protected `reverb_tail` **~0.42×**). Extreme is
> optional. Residual 2048 pad ~0.6% — not worth trim. Lab/advanced only; MP5-L stays default.
> No claim vs MP3/AAC/Opus/FLAC/WAV.

## MDCT / psychoacoustic redesign (Phase 0–2 spike) — **GO (lab)**

Lab-only `mp5c3` MDCT loud path (`0x4D 0x33` standalone; vNext unit tag `TAG_MDCT` `0x4D`).
**Does not modify MP5-C v5.1.** Default/batch remain MP5-L. Default `encode_mp5c_vnext` still
uses legacy `TAG_LOSSY`→MP5-C; MDCT loud path is `encode_mp5c_vnext_mdct` / lab mode
`mp5c2-native-mdct-high`. Quiet/fragile/tail stay MP5-L (protect 1.5).

### Phase 0 size go/no-go (`dense_music`, native release)

| Mode | ×PCM | Full SNR | Notes |
|------|-----:|---------:|-------|
| vNext High (mp5c loud) | **0.941** | — | baseline |
| MP5-L | 0.590 | ∞ | lossless anchor |
| **mp5c3 MDCT High** | **0.167** | **~24.4 dB** | **GO** (≥5% under vNext; stretch ≤ MP5-L also met) |

Reproduce: `cargo test -p mp5-codec --release dense_music_fixture -- --nocapture`.

Standalone MDCT on quiet material is not bit-exact (use only behind vNext protect). Silence /
duration: exact. No claim vs MP3/AAC/Opus/FLAC.

### Phase 1

Masking-inspired HF step inflation from low-band energy + transient tighten (re-quant on
attacks). Size still ~0.167× on `dense_music` after Phase 1.

### Phase 2

`mp5c2::encode_mdct` writes `TAG_MDCT` payloads via `mp5c3`; decode accepts `TAG_MDCT` and
legacy `TAG_LOSSY`. Protect path still MP5-L. Lab WASM: `encode_mp5c_vnext_mdct`.

### Fast MDCT (FFT Type-IV) + real-track validate

`mp5c3/mdct.rs` uses a dependency-free radix-2 FFT Type-IV path (fixed N=2048) so WASM lab
modes are practical. Float OLA interior SNR > 80 dB; `dense_music` size/SNR gate unchanged
(~0.167× / ~24 dB). Default `encode_mp5c_vnext` still uses legacy MP5-C loud units.

`pnpm audio:validate-vnext-ref` also encodes High + Extreme via `encode_mp5c_vnext_mdct`
(protect 1.5) when the WASM export exists:

| Mode | Tail SNR | Hiss risk | Full SNR | ×PCM |
|------|---------:|:---------:|---------:|-----:|
| vNext Extreme (mp5c loud, protect 1.5) | ∞ | low | ~39.5 dB | 0.977 |
| **vNext MDCT High** | **∞** | **low** | **~26.8 dB** | **0.214** |
| **vNext MDCT Extreme** | **∞** | **low** | **~31.0 dB** | **0.268** |

Lab-only; no claim vs MP3/AAC/Opus/FLAC. MDCT remains opt-in (`encode_mp5c_vnext_mdct` /
`mp5c2-native-mdct-high`).

## Phase 4.4 — protect-scale experiment (timeboxed) — **GREEN**

`encode_mp5c_vnext_protect(samples, ch, preset, protect_scale)` widens quiet/fragile/tail
thresholds by `protect_scale` (≥1.0) without changing the bitstream format.
`pnpm audio:validate-vnext-ref` ran scales **1.0 / 1.25 / 1.5 / 2.0 / 3.0** on the local
commercial reference:

| protect | Tail SNR | Hiss risk | ×PCM |
|--------:|---------:|:---------:|-----:|
| 1.0 | 32.6 dB | medium | 0.978 |
| 1.25 | 35.7 dB | medium | 0.978 |
| **1.5** | **∞ (bit-exact tail)** | **low** | **0.977** |
| 2.0 | ∞ | low | 0.977 |
| 3.0 | ∞ | low | 0.971 |

**Verdict: green at protect_scale ≥ 1.5** — real-track hiss risk **low** without approaching 1× PCM
(size stayed ~0.97×). Shipping `encode_mp5c_vnext` / native `mp5c2::encode` and JS smooth
`VNEXT_PARAMS` now use the 1.5-widened thresholds. Scale 1.0 remains measurable via
`encode_mp5c_vnext_protect(..., 1.0)`.

## Lossless L/B coalescing (size-at-fixed-quality)

Adjacent quiet/fragile **L/B** sub-blocks now encode as one MP5-L unit (same protect decisions;
decode still trims by `n`). Measured with `pnpm audio:hiss-report` after protect 1.5:

| Mode | ×PCM (reverb_tail) | ×PCM (dense_music) | ×PCM (quiet_sine) | Hiss risk (reverb) |
|------|-------------------:|-------------------:|------------------:|:------------------:|
| smooth Extreme no-coalesce | 0.503 | 1.167 | 0.100 | low |
| lossy-only coalesce (prior) | ~0.676 | 0.971 | — | low |
| **lossy + L/B coalesce** | **0.420** | **0.971** | **0.084** | **low** |
| native Extreme (same) | 0.420 | 0.971 | 0.084 | low |

**Verdict:** go — hiss risk unchanged **low**; quiet/tail SNR still ∞; largest win on heavily
protected material. Loud path unchanged (already lossy-coalesced).

## Loud-path High vs Extreme (protect 1.5 fixed) — **GO High for size**

Same protect thresholds; only the MP5-C preset on `TAG_LOSSY` units changes.

| Mode | dense_music ×PCM | reverb hiss | real-track hiss | real-track ×PCM |
|------|-----------------:|:-----------:|:---------------:|----------------:|
| **smooth/native High** | **0.941** | low (∞ tail) | **low** (∞ tail) | **0.968** |
| smooth/native Extreme | 0.971 | low (∞ tail) | low (∞ tail) | 0.977 |

Full-song SNR is slightly higher on Extreme (~+1.4 dB dense / ~+1.3 dB real) but hiss risk
does not improve (tails already bit-exact). Converter default preset **High** is the preferred
loud-path size choice; Extreme remains available for A/B.

### Residual 2048-frame pad — **no-go for trim**

After lossy coalesce, pad is only the last incomplete MP5-C frame (~1640 samples on
`dense_music` ≈ **0.6%** of file). Not worth a short-frame MP5-C packing change.

## v0.26 — lossy coalescing

| Mode | ×PCM (reverb_tail) | ×PCM (dense_music) | Hiss risk (reverb) |
|------|-------------------:|-------------------:|:------------------:|
| smooth Extreme no-coalesce | 0.749 | 1.167 | low |
| **smooth Extreme + lossy coalesce** | **0.676** | **0.971** | **low** |
| native Extreme (lossy coalesce) | 0.676 | 0.971 | low |
| MP5-L | 0.655 | 0.751 | low |

## v0.24 — hysteresis/lookahead + noise-shaping experiment

The v0.23 sub-block+band engine still left the loud→quiet transition band partly lossy
(`reverb_tail` = medium, tail SNR ~33 dB). v0.24 adds a **decay latch with lookahead**: once a
sub-block is broadly quiet or low-level-and-staying-low for the next ~186 ms, the whole fade/tail
is protected losslessly until a clearly-loud sub-block breaks the latch. This protects the entire
decaying tail → tail windows become bit-exact → **risk low**.

| `reverb_tail` mode | ×PCM | Quiet SNR | Tail SNR | Worst-1s | Protected % | Hiss risk |
|--------------------|-----:|----------:|---------:|---------:|:-----------:|:---------:|
| MP5-C High | 0.360 | 4.8 | 14.0 | 0.0 | — | 🔴 severe |
| vNext block Extreme | 0.640 | 12.6 | 17.0 | 13.4 | 56.7 | 🟠 high |
| vNext sub-block+band Extreme (v0.23) | 0.751 | ∞ | 33.0 | ∞ | 74.5 | 🟡 medium |
| **vNext smooth Extreme (v0.24)** | **0.749** | **∞** | **∞** | **∞** | 76.0 | 🟢 **low** |
| vNext shaped Extreme (experiment) | 0.768 | ∞ | **27.1** | ∞ | 74.5 | 🟡 medium |
| MP5-L (anchor) | 0.655 | ∞ | ∞ | ∞ | — | 🟢 low |

**Noise shaping — rejected (measured).** Pre/de-emphasis on lossy sub-blocks (`mp5c2-shaped-extreme`)
made tail SNR *worse* (de-emphasis colours the quantization noise toward LF and the per-sub-block
filter reset adds boundary error), and it has nothing useful to act on once the fragile content is
already coded losslessly. Real noise shaping belongs inside the quantizer (a from-scratch
transform-domain codec), not as a JS bolt-on — see [MP5C_VNEXT_PLAN.md](MP5C_VNEXT_PLAN.md).

## What changed (v0.23, retained)

The block-level vNext protected whole 8192-frame (~186 ms) blocks, so quiet moments
inside loud blocks stayed lossy. v0.23 adds two localized decisions
([`tools/audio-lab/codecs.mjs`](../tools/audio-lab/codecs.mjs)):

1. **Sub-block detection** — decide lossless/lossy per **1024-frame (~23 ms) sub-block**, so
   decaying tails switch to lossless as soon as they fall below the quiet threshold.
2. **Per-band detection** — additionally escalate a *low-level* sub-block to lossless when it
   carries a **quiet-but-present high-frequency tail** (3.6 kHz high band peak in a fragile
   range) — the exact signal MP5-C turns to hiss — **without** wasting lossless on HF that is
   masked by a loud low end.

Noise-shaped quantization was **evaluated and deferred**: real noise shaping needs control of
the MP5-C quantizer, which lives in the Rust codec (out of scope this milestone — `rust/` was
read-only). The JS lab can only compose whole-signal encoders, so shaping is recorded as a
medium-term redesign item in [MP5C_VNEXT_PLAN.md](MP5C_VNEXT_PLAN.md) rather than shipped as a
fragile lab hack.

## Modes

| Mode id | What it is | Status |
|---------|-----------|--------|
| `mp5c2-lab` / `mp5c2-extreme` | Previous **block-level** vNext (High / Extreme) | frozen baseline for comparison |
| `mp5c2-subblock` | Sub-block only (High) | new |
| `mp5c2-bandquiet` | Sub-block + per-band (High) | **best High** |
| `mp5c2-bandquiet-extreme` | Sub-block + per-band (Extreme) | **best Extreme** |

## Results — `reverb_tail` (the hiss-exposing fixture)

| Mode | ×PCM | Quiet-window SNR | Worst-1s quiet | Tail SNR | Protected % (L / B) | Hiss risk |
|------|-----:|-----------------:|---------------:|---------:|:-------------------:|:---------:|
| MP5-C High | 0.360 | 4.8 | 0.0 | 14.0 | — | 🔴 severe |
| MP5-C Extreme | 0.372 | 5.7 | 0.0 | 14.4 | — | 🔴 severe |
| vNext block Extreme (prev) | 0.640 | 12.6 | 13.4 | 17.0 | 56.7 (56.7 / 0) | 🟠 high |
| vNext **sub-block** High | 0.719 | **22.3** | 13.6 | 17.1 | 59.8 (59.8 / 0) | 🟠 high |
| vNext **sub-block+band** High | 0.741 | **∞** | **∞** | 28.4 | 74.5 (59.8 / **14.7**) | 🟡 **medium** |
| vNext **sub-block+band** Extreme | 0.751 | **∞** | **∞** | 33.0 | 74.5 (59.8 / **14.7**) | 🟡 **medium** |
| MP5-L (anchor) | 0.655 | ∞ | ∞ | ∞ | — | 🟢 low |

Sub-block alone nearly doubles quiet-window SNR (12.6 → 22.3); the per-band rule then adds the
fragile-HF-tail sub-blocks (the extra **14.7%** "B" protection), making the quiet windows
bit-exact and the residual tail SNR rise to ~28–33 dB — risk **high → medium**.

## Other fixtures

- `silence`: bit-exact (100% protected) — low. `quiet_sine`: bit-exact (∞) — low. No regression.
- `vocal_like`, `dense_music`: loud throughout → **0% fallback** (per-band correctly does not
  waste lossless on masked content); quality identical to MP5-C.

## Size cost (honest)

Fine sub-blocks make lossy sub-blocks pad to the 2048-frame MP5-C frame, so loud material grows:

| Fixture | MP5-C | vNext block | vNext sub-block+band |
|---------|------:|------------:|---------------------:|
| reverb_tail | 0.360 | 0.640 | 0.751 |
| dense_music | 0.941 | 0.972 | **1.167** |

On loud material the sub-block prototype can exceed 1× PCM. **This is why compression stays
secondary and vNext is not a shipping codec.** A natural future optimization (deferred) is to
coalesce adjacent lossy sub-blocks to remove the padding penalty — but that changes MP5-C frame
RMS and therefore quality, so it needs its own measurement pass.

## Verdict

vNext is **measurably closer to headphone-clean on quiet/reverb material** (reverb_tail now
medium, quiet windows bit-exact) and continues to be worth pursuing. It is **not yet clean**
(the loud-to-quiet transition band still has finite tail SNR; truly clean needs medium-term
noise shaping / transform-domain work in `MP5C_VNEXT_PLAN.md`). MP5-L stays the default;
MP5-C stays lab-only.
