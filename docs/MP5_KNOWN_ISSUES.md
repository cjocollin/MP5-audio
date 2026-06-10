# MP5 Known Issues

**Version:** MP5 Audio v0.16.1-beta (Public Beta)  
**Last updated:** 2026-05-22

## Product scope

MP5 is **experimental** and **browser-based**. This document lists honest limitations — not a promise of fixes on a schedule.

## Playback and stems

- **Large files** — Album packages (`.mp5p`) and multi-stem tracks can stress browser memory; very large packages may warn or fail on low-memory devices.
- **Stem preparation** — Decoding stems in workers takes time; UI shows preparation state. Solo/mute during prep is best-effort.
- **Playback transport** — Complex seek/loop/stem transitions may occasionally need a manual pause/play on slow devices (regression suite monitors this).

## Hosted demo

- **First load** — WASM (MP5 codec, FFmpeg) is large; cold start can be slow on mobile networks.
- **Service worker** — Updates may require a refresh to pick up a new deployment.
- **No copyrighted audio** — Demo fixtures are synthetic; user must load their own files locally.

## Formats and conversion

- **MP5-C hiss** — Known artifact/hiss on music material; lab-only, not default.
- **MP5-H** — Large/experimental; not default.
- **`.mp5p`** — Experimental album container; not a universal interchange standard.
- **FFmpeg WASM** — Large first-load download; FLAC/MP3/M4A convert paths depend on it loading successfully.

## Stems

- **Stem mix** — Experimental; uses more memory and CPU than full-mix AUDI playback.

## Not supported / not claimed

- AI stem separation in the app
- DRM or rights enforcement
- Legal or archival certification
- Beating MP3/AAC/Opus/FLAC on size or quality
- Third-party player ecosystem

## Flaky CI

- `e2e/playback-regression.spec.ts` test E (late Lead Vocal join) may flake under full `alpha:check` load; re-run is usually clean. Not treated as a product blocker for Public Beta.

## Reporting

Open issues on the project repository with reproduction steps, browser, and file size/format details.
