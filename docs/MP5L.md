# MP5-L lossless codec

MP5-L is the **recommended default export** for listening-quality files. It guarantees **bit-exact** round-trip: decoded PCM matches the original sample-for-sample.

## Bitstream versions

| Ver | Encoder | Contents |
|-----|---------|----------|
| **v2** | Legacy | Raw PCM per block + CRC (~100% of PCM size) |
| **v3** | Current | Silence / const / LPC / delta + varint / raw; optional stereo M/S |

Decoder accepts **v2 and v3**.

## v3 block types

| Flag | Name | Use |
|------|------|-----|
| 0 | Raw | Fallback dense PCM |
| 1 | Silence | All zeros |
| 2 | Const | Repeated sample value |
| 3 | LPC | Fixed predictor order 0–4 + zigzag-varint residuals |
| 4 | Delta | First-order delta + zigzag-varint |
| — | MS hint | Bit `0x80` on left-channel block flag: mid/side pair (FLAC-style) |

Per block: 4096 samples/channel (default), 13-byte header (length, flag, CRC, payload length). Stereo streams store **all channel-0 blocks, then all channel-1 blocks** (not interleaved blocks).

## Compression (ORIGAMI reference, May 2026)

| Mode | vs PCM | Bit-exact |
|------|--------|-----------|
| MP5-L v2 raw | 1.002× | yes |
| **MP5-L v3** | **0.945×** | yes |
| MP5-C High (lab) | 0.967× | no |
| MP5-H High + CORR | 1.815× | no |

v3 on ORIGAMI: **7.56 bits/sample** (725 LPC, 1228 delta, 38 silence, 1633 raw blocks). Stretch goal ≤0.80× PCM not met yet; MP5-L does **not** beat FLAC on this track.

Run: `pnpm bench:mp5l-compression` → `benchmarks/real-music/MP5L_COMPRESSION.md`

## Predictors

Fixed orders 0–4 (FLAC-style), chosen per block by smallest verified payload size. Encoder verifies full payload round-trip before selecting a compressed mode.

## Quality gates

- Bit-exact decode (required)
- No hiss (lossless)
- No clipping introduced by codec
- No duration drift

## Policy

**MP5-L remains the default export** — bit-exact, no hiss. MP5-H is validated hybrid but ~2× MP5-L on ORIGAMI. MP5-C is lab-only until redesigned.

## Related

- [MP5_CODEC_SPEC.md](./MP5_CODEC_SPEC.md)
- [MP5H.md](./MP5H.md) — hybrid uses MP5-L for CORR
- [MP5C_BLOCKER.md](./MP5C_BLOCKER.md) — MP5-C alone not for listening
- [MP5_LIMITATIONS.md](./MP5_LIMITATIONS.md)
