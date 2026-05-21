# MP5 stem worker profile (v0.10.4-alpha hotfix)

**Milestone:** Worker-Based Stem Decoding Hotfix  
**Version:** MP5 Audio v0.10.5-alpha

## v0.10.5 STDF CRC hotfix

**Root cause:** Worker wire messages omitted `payloadCrc32` and `payloadLength`. Reconstruction compared `crc32(payload)` to `undefined` → false CRC mismatch. A secondary risk was transferring the same `ArrayBuffer` backing parsed fragments (detached after first job).

**Fix:** Include CRC metadata on wire fragments; always `slice()` before transfer.

## v0.10.4 profile (baseline)

## Method

Code-path review plus prior Node/browser measurements on a large real-world file:

`Melanie Martinez - Pity Party.mp5` (~274 MB, 10 stems, **stdf-v1**, 24 STDF fragments, ~229 MB embedded stem data).

## Longest main-thread stalls (v0.10.3 → v0.10.4)

| Area | v0.10.3 | v0.10.4 |
|------|---------|---------|
| Initial `parseMp5` on file drop | **High** — full read + integrity | **Yielding** `parseMp5Async` for files ≥ 48 MiB; staged status UI; integrity deferred until after decode |
| STDF `groupStdfFragments` | Low | Low (main) |
| HASH / integrity | Part of parse | Part of parse |
| Stem manifest parse | Low | Low |
| STDF reconstruct per stem | **High** (main, yielded) | **Worker** (per stem) |
| MP5-L stem decode | **High** (main WASM) | **Worker WASM** (once per worker) |
| Karaoke all-stem decode | Fixed in v0.10.3 (subset) | Worker subset |
| React stem panel | Moderate on progress | Lighter during worker work |
| Synced lyrics | Clock-based ~15 fps | Unchanged |
| Waveform / song map | Optional cost on open | Unchanged |

## When lag is felt

- **File open:** ingest + `parseMp5` on the main thread (dominant for 250+ MB drops).
- **Stem interaction:** reconstruct/decode moved off main thread in v0.10.4; UI should stay responsive during solo/prepare/karaoke.

## Lyrics drift

- Lyrics use **AudioContext playback time**, not stem-prep completion.
- Drift during heavy **main-thread** parse is still possible; drift during **worker** stem prep should be reduced.

## Architecture summary

1. Main builds a **per-stem job** with only that stem’s STDF fragments (transferable buffers) or one STDA frame.
2. Worker: reconstruct → WASM `decode_mp5l` → postMessage PCM with transferred `samples.buffer`.
3. Main stores in `StemDecodeCache` and mixes via existing stem mixer.
4. On Worker/WASM failure: calm warning + prior main-thread `loadStemFrameData` + `decodeStemFrame` path.

## Limitations

- Does not shrink `.mp5` size or move initial container parse to a worker.
- STDA mode still extracts one frame per job on main before post (acceptable for small STDA sets).
- Browser RAM caps unchanged (~384 MB decode cache policy).
