# MP5-L v4 hard-fail soak log

**Date:** 2026-07-21
**App version:** 0.28.0-beta (pre-default-flip soak on same train)
**Gate:** `MP5L_GATE_DECISION.txt` = `PROMOTE_V4` (median 0.989x flac-5, worst 0.999x)

## Encode soak set

| Set | Files | Result |
|-----|------:|--------|
| Music held-out (`corpus/held-out/*.flac`) | 20 | Bench `bit_exact_v4=yes` all rows; zero encode failures |
| Speech archive (`corpus/speech-held-out/`) | 20 | Prior SPEECH_PASS run; bit-exact retained historically |
| Unit (`cargo test -p mp5-codec --lib mp5l`) | suite | Run at soak time |

## Hard-fail policy

- Lab/export path `mp5l_v4` must not silent-fallback to v3 (`convertToMp5.ts`).
- Soak observed **0** field encode failures on the promote corpus.

## Native speed

- Held-out primary xRT typically **3.1-4.1x** (promote bar >=2x met).

## Decision

Soak **PASS** — Converter + batch default flipped to `mp5l_v4`.