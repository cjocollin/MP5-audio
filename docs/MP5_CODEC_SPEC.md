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

## MP5-C (lossy) — lab-only

- Time-domain quantization with full-scale-relative step (not MDCT in the shipping pack)
- Known quiet-passage hiss — see [MP5C_HISS_AUDIT.md](MP5C_HISS_AUDIT.md)
- Presets: Low / Standard / High / Extreme
- AUDI payload magic `0x43` + version `0x02`…`0x06`

**Not competitive with AAC/Opus.** Not the default export.

## MP5-C2 / vNext (hybrid) — lab/advanced

- Quiet/fragile/tail sub-blocks → MP5-L; loud → MP5-C (coalesced lossy runs)
- Distinct AUDI magic `0x43 0x34`; CodecId **5**
- Converter: gated behind **Show lab / advanced codecs**; batch stays MP5-L
- Shipping protect-scale **1.5** (real-track hiss risk low at ~0.97× PCM)

See [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md).

## MP5-H (hybrid)

- Base: MP5-C in AUDI
- CORR: compressed residual
- Modes: `base_only`, `enhanced`
- Often large (>1× PCM); not default

## Frame bitstream (codec-internal)

Documented in `rust/mp5-codec` module headers. Container framing is in [MP5_CONTAINER_SPEC.md](MP5_CONTAINER_SPEC.md).
