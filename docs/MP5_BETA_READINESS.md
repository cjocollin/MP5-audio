# MP5 Beta Readiness

**Version:** MP5 Audio v0.20.0-beta  
**Status:** Public Beta - spec / developer toolkit polish candidate  
**Last updated:** 2026-06-16

## Decision

Pending final local gates, production deployment, and hosted verification.

Target decision: accept **MP5 Audio v0.20.0-beta** as deployed Public Beta if all required gates pass and the hosted app at https://mp5-audio.vercel.app shows `MP5 Public Beta - v0.20.0-beta`.

## Scope

- Developer-facing docs: quickstart, compatibility matrix, fixture catalog, chunk registry, specs, hosted-demo notes, known issues, and release notes.
- CLI polish: clearer inspect/validate usage, profiles, examples, and failure wording.
- Tests: version alignment, public claims, toolkit docs, registry limits, and CLI help coverage.
- No codec work, playback transport rewrite, converter encoding change, MP5/STDF/MP5P/LYRC/VISU/metadata semantic change, telemetry, upload, cloud sync, or private/copyrighted audio.

## Gate Summary (v0.20.0-beta)

| Gate | Result |
|------|--------|
| `pnpm lint` | Pending |
| `pnpm test` | Pending |
| `pnpm test:compat` | Pending |
| `CI=1 pnpm test:e2e` | Pending |
| `pnpm playback:check` | Pending |
| `CI=1 pnpm alpha:check` | Pending |
| `CI=1 pnpm beta:check` | Pending |
| `pnpm build` | Pending |
| `pnpm deploy:check` | Pending |
| Package validation | Pending |
| Production deploy | Pending |
| `MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify` | Pending |
| `MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted` | Pending |

## What must NOT be claimed

Do not claim:

- Production-ready or stable final release.
- Beats MP3, AAC, Opus, or FLAC.
- DRM enforcement, rights enforcement, legal proof, or archival certification.
- No AI stem separation or AI generation in the reference app.
- No telemetry, upload, cloud sync, or third-party ecosystem support.

Allowed wording:

- Public Beta.
- Experimental and browser-based.
- MP5-L v3 default/recommended.
- MP5-C lab-only; MP5-H large/experimental; PCM reference/debug.
- `.mp5p` experimental; large albums/stems can be heavy.
- Not production-ready for archival/legal use.

## Verification Commands

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
