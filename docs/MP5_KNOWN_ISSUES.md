# MP5 Known Issues

**Version:** MP5 Audio v0.18.0-beta (Public Beta)  
**Last updated:** 2026-06-14

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

## Library

- **Browser storage limits** — Saved tracks and embedded packages share browser quota; very large `.mp5p` files may fail to save or be evicted if the user clears site data.
- **Manifest albums** — `.mp5p` manifest entries reference sidecar `.mp5` files; tracks must remain in the library for full album playback.
- **Recently opened** — Metadata only unless saved; file-picker opens cannot be reopened after refresh without saving or re-selecting the file.
- **No cloud sync** — Library data is per-browser profile only.

## Dev toolchain

- **`pnpm audit` (dev-only):** One remaining **high** finding in transitive `esbuild@0.25.x` (via `vite@6.4.2` under Vitest). Advisory GHSA-gv7w-rqvm-qjhr targets Deno module install paths — not exploitable in this Node/pnpm CI workflow. Patched in `esbuild@>=0.28.1`, which requires a **Vite major upgrade** (6→8); deferred for v0.18.0-beta to avoid destabilizing the production build. Vitest was upgraded to `^3.2.6`, clearing the prior critical Vitest UI advisory and other moderate Vite/esbuild findings.

## Reporting

Open issues on the project repository with reproduction steps, browser, and file size/format details.
