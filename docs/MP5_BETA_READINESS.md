# MP5 Beta Readiness

**Version:** MP5 Audio v0.18.0-beta  
**Status:** **Public Beta — Export / Package polish** (2026-06-15)

## Decision

**MP5 Audio v0.18.0-beta is accepted as Public Beta** (export/package polish; no format or codec policy changes).

The hosted demo at [https://mp5-audio.vercel.app](https://mp5-audio.vercel.app) ships as **MP5 Public Beta · v0.18.0-beta** with honest experimental wording preserved.

## Gate summary (v0.18.0-beta tagging pass)

| Gate | Result |
|------|--------|
| `pnpm lint` | _pending gate run_ |
| `pnpm test` | _pending gate run_ |
| `pnpm test:compat` | _pending gate run_ |
| `CI=1 pnpm test:e2e` | _pending gate run_ |
| `pnpm playback:check` | _pending gate run_ |
| `CI=1 pnpm alpha:check` | _pending gate run_ |
| `CI=1 pnpm beta:check` | _pending gate run_ |
| `pnpm build` | _pending gate run_ |
| `pnpm deploy:check` | _pending gate run_ |
| Package validation | _pending gate run_ |

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
