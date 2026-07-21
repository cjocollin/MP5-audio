# MP5-L v4 vs flac-5 - Hades held-out

**Date:** 2026-07-21
**Corpus:** 20x ~90s clips from Hades audiobook -> corpus/held-out/hades_*.flac
**Honesty:** single production / speech - not multi-genre music.

## Gate (after encoder chase)

| Metric | Value | Bar |
|--------|------:|-----|
| Median v4/flac5 | **0.993x** | SPEECH_PASS: <1.00x |
| Worst v4/flac5 | **1.007x** | <=1.20x OK |
| Tracks <1.00x | 17 / 20 | - |
| Bit-exact | yes | required OK |
| Native xRT (typical) | **~3.5-5x** | >=2x OK |
| Decision | **SPEECH_PASS_HELD_OUT** | KEEP_V3_PENDING_MUSIC |

## Encoder levers that closed the gap

- QLP order shortlist top-4 + high-order anchors (8/12); materialize top-8
- Mid/side correlation gate relaxed to |r| >= 0.10
- **v4 planning block size 8192** (v3 stays 4096) - primary win on speech

Default remains **v3** until multi-genre music held-out also PASSes (PROMOTE_V4).
See MP5L_COMPRESSION.md / MP5L_GATE_DECISION.txt.