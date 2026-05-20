# MP5-C experimental — limitations

MP5-C is **not** a replacement for MP3, AAC, Opus, or FLAC. It is **not ready for normal listening** as of the 2026-05-19 transparency blocker.

## Listening status: BLOCKED

Headphone tests: **all MP5-C presets** (Standard, High, Extreme) exhibit noticeable background hiss. **PCM fallback** and **MP5-L** are clean.

Use **MP5-L** for quality exports. Use **PCM** as uncompressed reference. Treat **MP5-C** as experimental research only.

See `docs/MP5C_BLOCKER.md` and `benchmarks/real-music/MP5C_BLOCKER_REPORT.md`.

## Recommended export policy

| Codec | Use |
|-------|-----|
| **MP5-L** | **Default** — lossless, listening-ready |
| **PCM** | Reference / archival |
| **MP5-C** | Lab benchmarks only — may hiss on all presets |
| **MP5-H** | Hybrid option — bit-exact with CORR on ORIGAMI; ~2× MP5-L size. See `docs/MP5H.md` and `benchmarks/real-music/MP5H_VALIDATION.md` |

## Bitstream versions

| Ver | Magic | Encoder | Notes |
|-----|-------|---------|-------|
| v2–v5.1 | `0x43 0x02`–`0x06` | v5.1 default | Scalar quant + entropy; **not listening-ready** |

Decoder supports v2–v5.1 for research. Re-convert after `pnpm wasm:build` for player parity.

## Why MP5-C hisses (summary)

- **Quantization noise**, not container/player and not bit-packing errors.
- MP5-L stores PCM blocks verbatim; MP5-C quantizes every frame in float space.
- Silence round-trip is exact; **non-silent quiet material** retains audible quant floor.
- Full-song SNR alone is **not** an approval metric.

## Presets (MP5-C — experimental only)

| Preset | Role |
|--------|------|
| Low | Preview — strong hiss |
| Standard | Smaller — hiss |
| High | Finer step — still hisses by ear |
| Extreme | Finest MP5-C step — still hisses by ear |

## Compression

- v5.1 band/M/S heuristics **frozen** until transparency gate passes.
- Size targets (e.g. 0.88× PCM) are secondary to audibility.

## Reports

- `benchmarks/real-music/MP5C_BLOCKER_REPORT.md`
- `benchmarks/real-music/HISS_INVESTIGATION.md`
- `benchmarks/real-music/MP5H_VALIDATION.md`
- `docs/MP5C_HISS_INVESTIGATION.md`
- `docs/MP5H.md`
- `docs/MP5C_V5_STRATEGY.md` — compression work paused

## Commands

```bash
pnpm bench:mp5c-blocker
pnpm bench:hiss-investigation
pnpm bench:mp5h-validation
cargo test -p mp5-codec --release
```
