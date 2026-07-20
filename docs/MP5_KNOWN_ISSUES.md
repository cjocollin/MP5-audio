# MP5 Known Issues

**Version:** MP5 Audio v0.27.0-beta (Public Beta)  
**Last updated:** 2026-07-17

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

- **MP5-C hiss** - known hiss/artifact risk on music material; it remains lab-only. The Audio Quality Lab measures the cause: on decaying/quiet passages MP5-C's quiet-window SNR drops to ~2.6–5.7 dB even when full-song SNR looks fine. See [MP5_CODEC_STATUS.md](MP5_CODEC_STATUS.md).
- **MP5-C2 (`CodecId` MP5C2)** — hybrid quiet-lossless + C2-only signal-relative loud path (`TAG_SR` / `0x46`, CORR when unit SNR &lt; 52 dB). Protect-scale **1.5**. Mid/loud SNR is part of hiss risk (quiet-only “low” is not enough). Converter: first-class **Lossy / hybrid** option (not default); classic MP5-C stays lab-gated. Listening DoD: [MP5C2_ABX_PROTOCOL.md](MP5C2_ABX_PROTOCOL.md). See [MP5C_VNEXT_RESULTS.md](MP5C_VNEXT_RESULTS.md).
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
