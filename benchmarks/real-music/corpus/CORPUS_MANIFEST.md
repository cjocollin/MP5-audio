# MP5-L FLAC A/B corpus freeze

## Layout

| Role | Path | Purpose |
|------|------|---------|
| **Tuning / smoke** | `tuning/` | ORIGAMI full + segments (one master). Day-to-day encoder work only. |
| **Held-out primary** | `held-out/` | Independent masters for formal size accept + promote gate. |
| **Speech archive** | `speech-held-out/` | Prior Hades SPEECH_PASS clips (if present). |
| Legacy flat files | `*.flac` at corpus root | Still loaded as tuning if present (compat). |

## Honesty (2026-07-21 refresh)

Held-out seeded from `C:\Users\colli\Music\flac-mp5 tests`:

| Bucket | Sources |
|--------|---------|
| K-Pop | HUNTR/X Takedown, Saja Boys Your Idol (2 windows each) |
| Alt / indie | ORIGAMI; Hades tracks cult / grudges / avoidant |
| Pop | Britney Spears (3 tracks + extra window) |
| EDM | ILLENIUM Good Things Fall Apart |
| Alt-pop | Jon Bellion Jim Morrison |
| Hip-hop | Nicki Minaj Itty Bitty Piggy, Only |

**20 clips / multiple artists & genres.** Second windows from long tracks are still the same master (documented). Stem variants (Acapella / Instrumental / Sing-Along) are **not** in held-out — they are packed into stem `.mp5` demos separately.

## Hash protocol

`HELD_OUT_HASHES.txt` must be **UTF-8** (no BOM / no UTF-16).