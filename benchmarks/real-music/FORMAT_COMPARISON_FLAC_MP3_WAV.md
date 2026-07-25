# Format comparison: WAV vs FLAC vs MP3 vs MP5

Generated (UTC): 2026-07-22T06:53:34.8646984Z

## Method

- **Sources:** `C:\Users\colli\Music\flac-mp5 tests`
- **Tracks:** 11 single-track FLAC+MP5 pairs (no multi-stem, no `.pre-alias-baseline`)
- **WAV:** `pcm_s16le` via ffmpeg (source SR/channels)
- **MP3:** `libmp3lame` **320 kbps CBR**, audio-only (`-vn`; no cover art)
- **FLAC / MP5:** original files
- **Temp:** `C:\Users\colli\Music\flac-mp5 tests\_compare_tmp`
- **MP5 lossless verify:** not verified in this run

## Totals (11 tracks, 2536.2 s audio)

| Format | Total bytes | vs WAV | Avg effective bitrate |
|--------|------------:|-------:|----------------------:|
| WAV (16-bit PCM) | 463693080 | 1.0000 | 1462662 bps |
| FLAC | 491977554 | 1.061 | 1551882 bps |
| MP3 (320k CBR) | 101482806 | 0.2189 | 320115 bps |
| MP5 | 311446826 | 0.6717 | 982420 bps |

Per-track average ratios vs WAV: FLAC=1.0777, MP3=0.2185, MP5=0.6732

### Subset: 16-bit sources only (2 tracks)

| Format | Bytes | vs WAV |
|--------|------:|-------:|
| WAV | 98569332 | 1.0000 |
| FLAC | 64640941 | 0.6558 |
| MP3 | 22356792 | 0.2268 |
| MP5 | 64219148 | 0.6515 |

### Subset: 24-bit sources (9 tracks)

WAV baseline is **16-bit**; FLAC keeps **24-bit**, so FLAC can exceed WAV size.

| Format | Bytes | vs 16-bit WAV |
|--------|------:|--------------:|
| WAV (16-bit) | 365123748 | 1.0000 |
| FLAC (24-bit) | 427336613 | 1.1704 |
| MP3 | 79126014 | 0.2167 |
| MP5 | 247227678 | 0.6771 |

## Per track

| Track | Dur (s) | SR | Ch | Bits | WAV | FLAC | MP3 | MP5 | FLAC/WAV | MP3/WAV | MP5/WAV |
|-------|--------:|---:|---:|-----:|----:|-----:|----:|----:|---------:|--------:|--------:|
| - ORIGAMI! | 154.566 | 48000 | 2 | 24 | 29676974 | 35810707 | 6190168 | 21533447 | 1.2067 | 0.2086 | 0.7256 |
| 02-is-this-a-cult | 187.179 | 48000 | 2 | 24 | 35938592 | 39306243 | 7490178 | 21385109 | 1.0937 | 0.2084 | 0.595 |
| 06-grudges | 217.531 | 48000 | 2 | 24 | 41766060 | 48489751 | 8703611 | 27853905 | 1.161 | 0.2084 | 0.6669 |
| 08-avoidant | 269.672 | 48000 | 2 | 24 | 51777244 | 57184409 | 10789691 | 31759096 | 1.1044 | 0.2084 | 0.6134 |
| Britney Spears - Break the Ice | 196.044 | 44100 | 2 | 24 | 34582336 | 42996923 | 7844536 | 26072595 | 1.2433 | 0.2268 | 0.7539 |
| Britney Spears - Get Naked (I Got a Plan) | 285.076 | 44100 | 2 | 24 | 50287664 | 62164374 | 11406589 | 37282293 | 1.2362 | 0.2268 | 0.7414 |
| Britney Spears - Gimme More_01 | 251.244 | 44100 | 2 | 24 | 44319706 | 52403410 | 10052402 | 30588808 | 1.1824 | 0.2268 | 0.6902 |
| ILLENIUM - Good Things Fall Apart (with Jon Bellion) | 216.668 | 48000 | 2 | 24 | 41600716 | 50336202 | 8669479 | 29903510 | 1.21 | 0.2084 | 0.7188 |
| Jon Bellion - Jim Morrison | 199.4 | 44100 | 2 | 24 | 35174456 | 38644594 | 7979360 | 20848915 | 1.0987 | 0.2269 | 0.5927 |
| Nicki Minaj - Itty Bitty Piggy | 246.753 | 44100 | 2 | 16 | 43527502 | 30006319 | 9872756 | 29314257 | 0.6894 | 0.2268 | 0.6735 |
| Nicki Minaj - Only | 312.027 | 44100 | 2 | 16 | 55041830 | 34634622 | 12484036 | 34904891 | 0.6292 | 0.2268 | 0.6342 |

## Observations (measured only)

- **MP3** is smallest (~21.9% of WAV) at lossy 320 kbps.
- **MP5** total is **smaller than FLAC** on this set (MP5 0.6717 vs WAV; FLAC 1.061 vs WAV).
- On the two **16-bit** sources (fair lossless vs WAV), **FLAC is slightly smaller than MP5** (FLAC 0.6558 vs MP5 0.6515 of WAV).
- On **24-bit** sources, comparing FLAC/MP5 to 16-bit WAV overstates lossless compression relative to full-depth PCM.

## Caveats

- WAV is always 16-bit in this run.
- MP3 is lossy; smaller size ≠ equal quality.
- MP5 bit-identical PCM verify not run.
- Machine-readable: `FORMAT_COMPARISON_FLAC_MP3_WAV.json`



## About-page Size column (fair same-depth subset)

Existing paired `.mp5` files for 24-bit FLAC masters are sized like 16-bit encodes. The About **Size vs WAV** column therefore uses only the **2 native 16-bit** masters:

| Format | vs WAV |
|--------|--------|
| WAV | 1.00x |
| FLAC | 0.66x |
| MP5-L | 0.65x |
| MP3 320k | 0.23x |

Matched bit-depth full corpus (11 tracks, FLAC vs same-depth WAV only): FLAC **0.76x** WAV. See `FORMAT_COMPARISON_MATCHED_DEPTH.json`.
