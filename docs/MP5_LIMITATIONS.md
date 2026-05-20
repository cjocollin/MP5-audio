# MP5 Known Limitations (v0.1)

## Format status

MP5 is an **experimental prototype**, not a standardized format.

## MP5-C

- Audible artifacts at low bitrates (pre-echo, HF loss)
- No mature VBR
- Psychoacoustic model is educational, not tuned
- **Do not claim** MP3/AAC/Opus superiority without measurements

## MP5-L

- **v3** (current): LPC + delta + varint + silence + optional stereo M/S; bit-exact on ORIGAMI ~**0.95× PCM** (see `benchmarks/real-music/MP5L_COMPRESSION.md`). Does not meet stretch ≤0.80× PCM; does not beat FLAC on reference material.
- **v2** legacy: raw PCM blocks only (~100% PCM).
- Block size fixed at 4096 samples/channel in v3.
- Mid/side only applied when full L/R round-trip is verified (extreme anti-correlated pairs may stay L/R).
- Encode slower than v2 raw due to per-block mode search.

## MP5-H

- Correction layer can inflate file size
- Enhancement quality is prototype-only

## Security

Untrusted `.mp5` files: parser enforces caps; metadata sanitized; never execute embedded content.

## Platform

- Browser decode via WASM (CPU cost on mobile)
- ffmpeg.wasm is large (~25MB+) when loaded

## AI / advanced / moonshot chunks

Optional. Missing chunks must not affect playback. AI tags may be wrong — user-editable, provenance labeled.
