# MP5 Known Issues

**Version:** MP5 Audio v0.30.1-beta (Public Beta)
**Last updated:** 2026-08-28

MP5 is experimental and browser-based. This document lists honest limitations, not scheduled promises.

## Playback And Stems

- Large `.mp5p` packages and multi-stem tracks can stress browser memory and storage.
- Stem mix preparation and playback use more CPU/memory than full-mix AUDI playback.
- Decoding stems in workers takes time; solo/mute during preparation is best-effort.
- Complex seek/loop/stem transitions can be heavy on slow devices; the playback regression suite monitors common cases.
- Tracks without waveform data show a fallback; playback and seek still use the main timeline.
- Dense lyrics, stems, and package views use capped scroll regions on small phones; long stem
  lists and album tracklists scroll inside the panel rather than stretching the whole page.

## Hosted Demo

- First load can be slow because MP5 codec WASM and FFmpeg WASM assets are large.
- Service-worker updates may require a refresh to pick up a new deployment.
- Hosted fixtures are synthetic only; users load their own files locally.

## Formats And Conversion

- **MP5-C classic hiss** (`CodecId` 1) - known hiss/artifact risk on music material; it remains lab-only. The Audio Quality Lab measures the cause: on decaying/quiet passages classic MP5-C's quiet-window SNR drops to ~2.6–5.7 dB even when full-song SNR looks fine. See [MP5_CODEC_STATUS.md](MP5_CODEC_STATUS.md).
- **MP5-C2 (`CodecId` MP5C2)** — **lossless / bit-exact**, not a lossy hybrid. Quiet/fragile/tail sub-blocks go to MP5-L; loud units take `min(TAG_SR+CORR, TAG_LOSSLESS)` by payload size, and both branches restore the source sample-for-sample. `TAG_LOSSY` (`0x43`) and `TAG_MDCT` (`0x4d`) are decode-only legacy / lab paths the shipping encoder never emits. Protect-scale **1.5**. Because output is bit-exact there is no hiss risk to rate and **no listening test applies** — correctness is checked by sample equality. Its real limitation is size: a real-music remeasure puts it at 0.77x PCM but **~1.07x MP5-L v4**, i.e. slightly *larger* than MP5-L, so it is **lab/advanced-gated and not default** and MP5-L v4 stays the recommended export. See [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md). ABX tooling in [MP5C2_ABX_PROTOCOL.md](MP5C2_ABX_PROTOCOL.md) is misnamed for this codec and is being retargeted at the lossy MDCT research path.
- MP5-H is large/experimental and not default. With CORR it is sample-exact content but averages >1× PCM.
- `.mp5p` is experimental and not a universal interchange standard.
- FFmpeg WASM handles non-WAV browser conversion paths and may fail to load on restrictive networks/devices.

## Audio Quality Lab

- Synthetic-fixture metrics are a measurement aid, not a guarantee about real music; full-song SNR can be misleading and must be read alongside quiet-window SNR, silence residual, and the null test. See [MP5_AUDIO_QUALITY_LAB.md](MP5_AUDIO_QUALITY_LAB.md).
- The lab reads WAV only for `--source`; convert FLAC/MP3 to WAV first. Local source files and generated reports/listening WAVs are never committed.

## Not Supported / Not Claimed

- AI stem separation in the app.
- DRM or rights enforcement.
- Legal or archival certification.
- Beating MP3/AAC/Opus/FLAC on size or quality.
- Third-party ecosystem support.
- Telemetry, upload, or cloud sync in the reference app.

## Library

- Browser storage quotas vary; very large embedded packages may fail to save or be evicted if site data is cleared.
- Manifest `.mp5p` entries reference sidecar `.mp5` files; the sidecars must stay available for playback.
- Recently opened entries are metadata-only unless saved.

## Dev Toolchain

- `pnpm audit` may report a dev-only transitive `esbuild@0.25.x` advisory through Vite/Vitest. It is tracked as a tooling upgrade item rather than a v0.20 product blocker.

## Reporting

Open an issue with reproduction steps, browser/OS, MP5 version, and file size/format details. Do not attach copyrighted/private audio unless you have rights and intentionally choose to share it.
