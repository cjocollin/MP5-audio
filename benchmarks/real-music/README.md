# Real-world benchmarks (local audio only)

Experimental benchmarks on **real** audio. **No copyrighted songs are committed to this repo.**

Reports (e.g. ORIGAMI) reference paths on the developer machine. Generated `.mp5` exports are gitignored.

## Sources (your machine only)

Place FLAC/WAV sources locally and point `MP5_BENCH_ROOT` at the folder (default: Desktop).
Default manifest expects:

- `- ORIGAMI!.flac` — full song
- Derived windows (clip, quiet segment, intro bass, mid vocal) from the same file

## Run

```bash
pnpm bench:real-music
```

Exports land in `benchmarks/real-music/exports/`. Report: `benchmarks/real-music/REPORT.md` (generated).

## Inspect any export

```bash
pnpm inspect:mp5 "path/to/file.mp5"
```

## Playback

Re-convert or use exports from `bench:real-music`. Player shows **MP5-C WASM v3 (experimental)** and compression ratio when known.
