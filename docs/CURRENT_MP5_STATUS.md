# Current MP5 Status

**Version:** MP5 Audio v0.16.1-beta (Public Beta)  
**Last updated:** 2026-05-22

## What MP5 is today

MP5 is an **experimental, browser-based** music format and player stack. The hosted demo at [https://mp5-audio.vercel.app](https://mp5-audio.vercel.app) is a **Public Beta** preview — not a production-ready archival or legal-proof system.

## Format policy (unchanged)

| Format | Role |
|--------|------|
| **MP5-L v3** | Default and recommended for playback and export |
| **MP5-C** | Lab / research only — not default |
| **MP5-H** | Large / experimental — not default |
| **`.mp5p`** | Experimental album package — browser memory limits apply |

## Recent milestone

- **v0.16.1-beta** — Public Beta tag after v0.16.1-beta-candidate gates, embedded album demo race fix, hosted QA 11/11, and maintainer acceptance.

## Honest limits

- Does **not** claim to beat MP3, AAC, Opus, or FLAC.
- Does **not** enforce DRM or provide legal proof.
- No AI stem separation in the product.
- Large albums and stems can be heavy in the browser.
- Not production-ready for archival or legal use.

## Where to look

- [MP5_BETA_READINESS.md](./MP5_BETA_READINESS.md) — Public Beta decision record (`pnpm beta:check`)
- [MP5_KNOWN_ISSUES.md](./MP5_KNOWN_ISSUES.md) — known limitations
- [MP5_HOSTED_DEMO.md](./MP5_HOSTED_DEMO.md) — hosted demo verification
- [MP5_MANUAL_QA_CHECKLIST.md](./MP5_MANUAL_QA_CHECKLIST.md) — manual QA sign-off
