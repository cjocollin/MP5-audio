# MP5 Codec Specification (v0.1)

Authoritative bitstream details live in `rust/mp5-codec` and the per-codec docs below.
This page is a short public summary.

## MP5-L (lossless) — default

- Block size: up to 4096 samples/channel (silence-aware planning may split earlier)
- Stereo: try L/R, mid/side, left-side, right-side; keep smallest verified
- Predictors: fixed orders 0–4 (higher LPC not used — overflow-safe)
- Residuals: zigzag-varint (`FLAG_RICE` = 3, legacy name) and/or **bit-packed Rice**
  (`FLAG_RICE_PACKED` = 6); encoder picks the smaller round-tripping payload
- CRC32 per block
- **Guarantee:** bit-exact roundtrip

See [MP5L.md](MP5L.md).

## MP5-C classic (legacy, lossy) — lab-only

- Time-domain quantization with full-scale-relative step (not MDCT in the shipping pack)
- Known quiet-passage hiss — see [MP5C_HISS_AUDIT.md](MP5C_HISS_AUDIT.md)
- Presets: Low / Standard / High / Extreme
- AUDI payload magic `0x43` + version `0x02`…`0x06`

**Not competitive with AAC/Opus.** Not the default export.

## MP5-C2 / vNext (lossless, bit-exact) — lab/advanced

- Quiet/fragile/tail sub-blocks → MP5-L; loud → `min(TAG_SR+CORR, TAG_LOSSLESS)` by payload
  size. Every unit the shipping encoder emits restores the source PCM sample-for-sample, so
  **C2 output is bit-exact**. `TAG_LOSSY` (`0x43`) and `TAG_MDCT` (`0x4d`) are decode-only
  legacy / lab paths that the shipping encoder never writes.
- Distinct AUDI magic `0x43 0x34`; CodecId **5**
- Converter: gated behind **Show lab / advanced codecs**; batch stays MP5-L
- Shipping protect-scale **1.5**
- Measured on a real-music corpus C2 is **0.77x PCM but ~1.07x MP5-L v4** — slightly *larger*
  than MP5-L with no quality advantage, so MP5-L v4 stays the recommended export. C2 correctness
  is verified by **sample equality**, not ABX/SNR.

Measured size: [`benchmarks/audio-quality/c2-real-track-remeasure.json`](../benchmarks/audio-quality/c2-real-track-remeasure.json).
The older `vnext-real-track-gate.json` C2 figures predate the bit-exact loud path — see
[`benchmarks/audio-quality/README.md`](../benchmarks/audio-quality/README.md).

See [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md).

## MP5-H (hybrid)

- Base: MP5-C in AUDI
- CORR: compressed residual
- Modes: `base_only`, `enhanced`
- Often large (>1× PCM); not default

## Frame bitstream (codec-internal)

Documented in `rust/mp5-codec` module headers. Container framing is in [MP5_CONTAINER_SPEC.md](MP5_CONTAINER_SPEC.md).
