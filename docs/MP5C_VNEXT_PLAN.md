# MP5-C vNext Plan

**Version:** MP5 Audio v0.22.0-beta  
**Principle:** **quality before compression.** No size target is set until the quality
gates below pass. vNext is **lab-only, default OFF**, gated behind Converter advanced codecs.

See the root-cause analysis in [MP5C_HISS_AUDIT.md](MP5C_HISS_AUDIT.md).

> **Where the lossy path lives now.** The MDCT research path described below has been given
> a real container identity as **CodecId 6 ("MP5-C")**. Its bitstream is normatively
> specified in [MP5C_NEXT_SPEC.md](MP5C_NEXT_SPEC.md) and implemented in
> `rust/mp5-codec/src/mp5c6.rs` (magic `0x43 0x36`, 28-byte CRC-protected header, per-unit
> CRC, MDCT loud path, bit-exact protect islands). It is lab-only, lossy, and **not frozen**;
> the quality gates in this document are the gates that path must pass.

> **Status note (supersedes the historical sections below).** The shipping `CodecId 5` /
> MP5-C2 encoder is now **lossless / bit-exact**. `rust/mp5-codec/src/mp5c2.rs` sends
> quiet/fragile/tail sub-blocks to MP5-L and loud units to `min(TAG_SR+CORR, TAG_LOSSLESS)`
> chosen by payload size; both branches restore the source sample-for-sample. `TAG_LOSSY`
> is decode-only legacy and `TAG_MDCT` is opt-in lab only — neither is emitted by
> `encode_mp5c_vnext` / `encode_mp5c_vnext_at`.
>
> Consequently the hiss-risk and quiet-window SNR gates below **do not apply to shipping
> C2**; it is verified by sample equality instead. They remain the gates for the lossy
> MDCT research path. The `mp5c2-*` JS lab modes in
> [`tools/audio-lab/codecs.mjs`](../tools/audio-lab/codecs.mjs) are still the older lossy
> prototypes and are no longer equivalent to the native shipping encoder.
>
> C2's real limitation is size: measured 0.77x PCM but ~1.07x MP5-L v4 — slightly *larger* than
> MP5-L with no quality advantage — so it stays lab/advanced-gated and MP5-L v4 remains the
> recommended export. Current measurement:
> [`benchmarks/audio-quality/c2-real-track-remeasure.json`](../benchmarks/audio-quality/c2-real-track-remeasure.json).

## What vNext is today (`mp5c2-lab`, `mp5c2-extreme`)

A JS-lab wrapper ([`tools/audio-lab/codecs.mjs`](../tools/audio-lab/codecs.mjs)) that splits
audio into 8192-frame blocks and encodes each block **losslessly (MP5-L) when its peak is
below ~−34 dBFS**, otherwise with **MP5-C** (High → `mp5c2-lab`, Extreme → `mp5c2-extreme`).
Quiet/silent blocks are always lossless regardless of preset; the preset only chooses the
lossy fallback for loud blocks. It composes existing WASM encoders — no new bitstream.

## Measured results (vs current MP5-C)

| Fixture | Metric | MP5-C High | vNext High | vNext Extreme |
|---------|--------|-----------:|-----------:|--------------:|
| silence | bit-exact | no | **yes** | **yes** |
| quiet_sine | quiet-window SNR | 10.5 dB (severe) | **∞ bit-exact** | **∞ bit-exact** |
| reverb_tail | quiet-window SNR | 4.8 dB | **10.6 dB** | **12.6 dB** |
| reverb_tail | worst-1s quiet SNR | **0.0 dB** | **12.6 dB** | **13.4 dB** |
| reverb_tail | hiss risk | severe | severe | **high** |

**Verdict: vNext is worth continuing.** It eliminates hiss on silence and sustained-quiet
content outright (lossless), and roughly doubles reverb-tail quiet SNR. But it is **not done**.

## Honest limitations (why it is still not listening-ready)

- **Block-granular quiet detection (8192 frames ≈ 186 ms).** A block that is mostly quiet
  but contains one loud transient is coded lossy in full, so the decaying tail inside it
  still hisses. This is why `reverb_tail` is still severe/high, not clean.
- **No per-band decision.** A bright-but-quiet cymbal tail is treated as "loud."
- **Size grows** wherever quiet blocks go lossless — acceptable under quality-first, but
  unmeasured against a target and clearly not a shipping trade-off yet.
- It is still built on the time-domain MP5-C for loud blocks, so loud-passage transparency
  is bounded by MP5-C.

## Short-term — status

1. **Sub-block quiet detection — DONE (v0.23).** Lossless/lossy decided per **1024-frame
   (~23 ms) sub-block** (`mp5c2-subblock`). Moved `reverb_tail` quiet-window SNR 12.6 → 22.3 dB.
2. **Per-band fallback — DONE (v0.23).** Low-level sub-blocks with a quiet-but-present 3.6 kHz
   high-band tail escalate to lossless (`mp5c2-bandquiet` / `-extreme`), without wasting
   lossless on masked HF. Took `reverb_tail` **high → medium**, quiet windows bit-exact.
   See [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md).
3. **Hysteresis + lookahead tail latch — DONE (v0.24).** A decay latch (`mp5c2-smooth`,
   `mp5c2-smooth-extreme`) protects the whole fade/tail losslessly until a clearly-loud sub-block
   breaks it. This took `reverb_tail` **medium → low** (quiet *and* tail windows bit-exact) at a
   size slightly smaller than v0.23. See [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md).
4. **Noise-shaped quantization — TRIED & REJECTED (with data).** A JS pre/de-emphasis variant
   (`mp5c2-shaped-extreme`) made `reverb_tail` tail SNR *worse* (33 → 27 dB): de-emphasis colours
   the quantization noise toward LF, the per-sub-block filter reset adds boundary error, and once
   the fragile content is coded losslessly there is little left for shaping to help. Real noise
   shaping needs control of the MP5-C quantizer (a from-scratch transform-domain codec), not a JS
   bolt-on — moved to the medium-term redesign below.
5. **Native Rust port — DONE (v0.25), since diverged.** The `smooth` engine landed as
   `rust/mp5-codec/src/mp5c2.rs`, exposed via `encode_mp5c_vnext`/`decode_mp5c_vnext`. It was
   bit-identical to the JS prototype **at that revision only**; the shipping encoder has since
   moved its loud path to bit-exact `min(TAG_SR+CORR, TAG_LOSSLESS)` and no longer matches the
   lossy JS modes. MP5-C (v5.1) is byte-identical (untouched); the vNext stream uses a distinct
   `0x43 0x34` magic.
6. **Gated CodecId + protect 1.5 — DONE.** `CodecId.MP5C2 = 5` is available under Converter
   **Show lab / advanced codecs** (not default; batch stays MP5-L). Protect-scale **1.5** is the
   shipping threshold. The historical "~0.97× PCM / hiss risk low" figure came from the older
   lossy-loud revision and is superseded — see
   [`benchmarks/audio-quality/README.md`](../benchmarks/audio-quality/README.md).
   Coalescing adjacent loud sub-blocks is **DONE**.
7. **Lossless L/B coalesce — DONE.** Adjacent L/B units share one MP5-L encode (`reverb_tail`
   ~0.68× → **~0.42× PCM**; hiss risk still **low**).
8. **Loud-path High vs Extreme — DONE (prefer High for size).** At protect 1.5, High keeps hiss
   risk **low** and cuts `dense_music` ~0.971× → **0.941×** (real track ~0.977× → **0.968×**).
   Residual 2048 pad after coalesce is ~0.6% → **no-go** for short-frame trim. Further size needs
   an MDCT / quant redesign (medium-term below). Keep measuring with `pnpm audio:hiss-report`.

## Medium-term (codec redesign) — Phase 0–2 lab spike **GO**

Measured lab work (not default; MP5-C v5.1 untouched):

1. **Signal-relative per-band MDCT quant + Rice/dense entropy** — `rust/mp5-codec/src/mp5c3/`.
   On exact `dense_music` fixture: **0.167× PCM** vs vNext High **0.941×** and MP5-L **0.590×**
   (Phase 0 go + stretch). Full SNR ~24 dB; quiet alone is not bit-exact — only behind vNext
   protect. See [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md).
2. **Masking-inspired HF allocation + transient tighten** — Phase 1 (lab).
3. **vNext loud-path wire** — `TAG_MDCT` (`0x4D`) via `encode_mp5c_vnext_mdct`; legacy
   `TAG_LOSSY`→MP5-C still decodes. Protect 1.5 quiet/fragile/tail stay MP5-L.
4. **Near-lossless residual sidecar** — still optional / not built (Phase 3).

Keep lab-gated; no default flip. Re-measure with `pnpm audio:hiss-report` after `pnpm wasm:build`
(FFT Type-IV MDCT in `mdct.rs` — WASM lab practical; real-track MDCT validate via
`pnpm audio:validate-vnext-ref`, see RESULTS).

## What NOT to do

- Do **not** set a compression target before the quality gates pass.
- Do **not** make MP5-C or vNext the default, or write vNext from batch export; MP5-L stays default/bit-exact.
- Do **not** expose vNext outside the Converter lab/advanced gate.
- Do **not** claim transparency from full-song SNR — only quiet/tail metrics count.
- Do **not** weaken the lab's honesty gates to make vNext look better.

## Quality gates before ANY public listening

vNext (or an MP5-C successor) may only be proposed for listening when **all** hold on the
synthetic set **and** a real reference track:

- silence: bit-exact; quiet_sine: bit-exact or quiet-window SNR ≥ 60 dB.
- reverb_tail: quiet-window SNR ≥ 40 dB **and** worst-1s quiet SNR ≥ 30 dB → **hiss risk low**.
- error spectral flatness in quiet windows not broadband (no audible hiss signature).
- no clipping on hot masters; no duration drift.
- a real commercial track: tail-window SNR ≥ 40 dB → hiss risk low.

## Compression goals (only after quality passes)

Once hiss risk is **low** across the gates above, *then* evaluate size: target ≤ MP5-L on
quiet-sparse material, and document honestly that MP5 makes **no** claim against MP3/AAC/
Opus/FLAC/WAV.
