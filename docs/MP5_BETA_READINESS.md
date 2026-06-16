# MP5 Beta Readiness

**Version:** MP5 Audio v0.19.0-beta
**Status:** **Public Beta - Player / Listening UX polish deployed** (2026-06-16)

## Decision

**MP5 Audio v0.19.0-beta is accepted as deployed Public Beta** (Player / Listening UX polish; no playback transport, format, or codec policy changes).

The hosted demo at [https://mp5-audio.vercel.app](https://mp5-audio.vercel.app) ships as **MP5 Public Beta - v0.19.0-beta** with honest experimental wording preserved.

Deployment URL: [https://mp5-audio-92mjchxml-cjocollins-projects.vercel.app](https://mp5-audio-92mjchxml-cjocollins-projects.vercel.app)
Deploy ID: `dpl_6TU1NuXSy9WxWEwyGmpTxHyNzDsu`

## Gate summary (v0.19.0-beta tagging pass)

| Gate | Result |
|------|--------|
| `pnpm lint` | Pass |
| `pnpm test` | Pass (492) |
| `pnpm test:compat` | Pass (25; ffmpeg-only compressed fixture skips unchanged) |
| `CI=1 pnpm test:e2e` | Pass (81, via alpha/beta gate) |
| `pnpm playback:check` | Pass (6 playback regression e2e; 30 timing/unit checks) |
| `CI=1 pnpm alpha:check` | Pass |
| `CI=1 pnpm beta:check` | Pass |
| `pnpm build` | Pass |
| `pnpm deploy:check` | Pass |
| Package validation | Pass (synthetic embedded and manifest `.mp5p`; HADES local file skipped under no private/copyrighted audio constraint) |
| Production deploy | Pass (`dpl_6TU1NuXSy9WxWEwyGmpTxHyNzDsu`) |
| `MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify` | Pass |
| `MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted` | Pass (11) |

## Player / Listening UX scope (v0.19.0-beta)

- Now Playing, queue/album context, timeline/waveform, lyrics/karaoke, stems, VISU fallback, mobile controls, and playback/error labels were polished.
- Existing playback transport, MP5-L lossless behavior, MP5-C lab-only policy, STDF behavior, MP5P semantics, and browser-local privacy model are unchanged.
- No codec work, AI generation, telemetry, uploads, cloud sync, or rights/legal verification.

## Previous gate summary (v0.17.1-beta tagging pass)

## Gate summary (v0.17.1-beta tagging pass)

| Gate | Result |
|------|--------|
| `pnpm lint` | Pass |
| `pnpm test` | Pass (461) |
| `pnpm test:compat` | Pass (25) |
| `CI=1 pnpm test:e2e` | Pass (79) |
| `pnpm playback:check` | Pass (6 playback regression; test E occasionally flaky under full-suite load — known, not a blocker) |
| `CI=1 pnpm alpha:check` | Pass |
| `CI=1 pnpm beta:check` | Pass |
| `pnpm build` | Pass |
| `pnpm deploy:check` | Pass |
| Package fixtures | Pass |
| HADES local QA | Pass (Melanie Martinez - HADES.mp5p, package profile) |
| `hosted:verify` | Pass |
| `test:e2e:hosted` | 11/11 Pass |

## Dependency audit (v0.17.1-beta)

| Before | After |
|--------|-------|
| 5 findings (1 critical, 2 high, 2 moderate) | 1 high (dev-only) |

- **Vitest** `2.1.9` → `3.2.6` — clears critical Vitest UI advisory and most Vite/esbuild transitives.
- **Remaining:** `esbuild@0.25.x` via `vite@6.4.2` (GHSA-gv7w-rqvm-qjhr, Deno-specific). **Accepted** for v0.17.1-beta; fix requires Vite major upgrade — **deferred**.

## Parser hardening (v0.17.1-beta)

Guards only — no MP5/STDF/MP5P format semantics change:

- Embedded `.mp5p`: `validateFileSize`, manifest/directory length caps, fragment `recordLength` cap.
- Manifest JSON: `MAX_ALBUM_MANIFEST_JSON_BYTES` (8 MiB) before `JSON.parse`.
- Metadata prefix parser: `MAX_CHUNKS` and `MAX_CHUNK_PAYLOAD` limits.
- Ingest: file-size checks before reading whole `.mp5p` blobs.

## What must NOT be claimed (public)

- Production-ready or stable final release
- Beats MP3 / AAC / Opus / FLAC
- DRM enforcement or legal proof
- AI stem separation
- Universal or third-party ecosystem support

## Allowed public wording

- **Public Beta**
- **experimental**, **browser-based**
- **MP5-L** default/recommended; **MP5-C** lab-only; **MP5-H** large/not default
- **`.mp5p`** experimental; large albums/stems can be heavy
- Not production-ready for archival/legal use

## Verification commands

```bash
pnpm lint
pnpm test
pnpm test:compat
CI=1 pnpm test:e2e
pnpm playback:check
CI=1 pnpm alpha:check
CI=1 pnpm beta:check
pnpm build
pnpm deploy:check
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted
```
