# MP5 Beta Readiness

**Version:** MP5 Audio v0.16.1-beta  
**Status:** **Public Beta accepted** (2026-05-22)

## Decision

**MP5 Audio v0.16.1-beta is accepted as Public Beta.**

The hosted demo at [https://mp5-audio.vercel.app](https://mp5-audio.vercel.app) ships as **MP5 Public Beta · v0.16.1-beta** with honest experimental wording preserved.

## Gate summary (v0.16.1-beta tagging pass)

| Gate | Result |
|------|--------|
| `pnpm test` | Pass |
| `CI=1 pnpm test:e2e` | Pass |
| `pnpm playback:check` | Pass |
| `CI=1 pnpm alpha:check` | Pass |
| `CI=1 pnpm beta:check` | Pass |
| `pnpm build` | Pass |
| `pnpm deploy:check` | Pass |
| Package fixtures | Pass |
| HADES local QA | Pass (when file present) |
| `hosted:verify` | Pass (post-deploy) |
| `test:e2e:hosted` | 11/11 (post-deploy) |
| Public claims audit | Pass |
| Physical phone spot-check | Pending optional (automated mobile viewport QA passed) |

## Path to Public Beta

1. **v0.16.0-beta-candidate** — Beta Candidate declaration, gates, deploy.
2. **v0.16.1-beta-candidate** — Manual hosted QA, embedded album race fix, 11/11 hosted e2e.
3. **v0.16.1-beta** — Final local gates, version bump, deploy, Public Beta tag.

## Blocker resolved (v0.16.1-beta-candidate)

**Embedded album demo race** in `DemoModePanel.tsx`: premature tab switch before `importAlbumPackageToPlayer()` completed. Fixed by removing early `setActiveTab("player")`.

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
pnpm test
CI=1 pnpm test:e2e
pnpm playback:check
CI=1 pnpm alpha:check
CI=1 pnpm beta:check
pnpm build
pnpm deploy:check
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted
```
