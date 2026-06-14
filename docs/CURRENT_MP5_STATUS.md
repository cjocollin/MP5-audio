# Current MP5 Status

**Version:** MP5 Audio v0.17.1-beta (Public Beta)  
**Last updated:** 2026-06-14

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

- **v0.17.1-beta** — Audit cleanup closeout: repo hygiene, Vitest upgrade, embedded `.mp5p` parser hardening, manifest JSON size caps, UTF-8 storage stats fix.
- **v0.17.0-beta** — Library polish: unified saved tracks/albums view, search/filter/sort, storage stats, recents, embedded package lazy cards.
- **v0.16.2-beta** — Public Beta hardening: feedback path, diagnostics copy, issue templates, first-user guidance.

## Honest limits

- Does **not** claim to beat MP3, AAC, Opus, or FLAC.
- Does **not** enforce DRM or provide legal proof.
- No automated stem separation in the product.
- Large albums and stems can be heavy in the browser.
- Not production-ready for archival or legal use.

## Where to look

- [MP5_PUBLIC_BETA_RELEASE_NOTES.md](./MP5_PUBLIC_BETA_RELEASE_NOTES.md) — Public Beta release notes and bug-report instructions
- [MP5_BETA_READINESS.md](./MP5_BETA_READINESS.md) — Beta gate record (`pnpm beta:check`)
- [MP5_KNOWN_ISSUES.md](./MP5_KNOWN_ISSUES.md) — known limitations
- [MP5_HOSTED_DEMO.md](./MP5_HOSTED_DEMO.md) — hosted demo verification
- [MP5_MANUAL_QA_CHECKLIST.md](./MP5_MANUAL_QA_CHECKLIST.md) — manual QA sign-off

## Local library (v0.17.x)

| Item | Storage |
|------|--------|
| Saved `.mp5` tracks | IndexedDB (`mp5-local-library`) |
| Manifest `.mp5p` albums | localStorage (`mp5-saved-albums-v1`) |
| Embedded `.mp5p` packages | IndexedDB blob + localStorage metadata (`mp5-saved-embedded-albums-v1`) |
| Recently opened | localStorage metadata only (`mp5-recent-library-v1`) |

Nothing is uploaded. Embedded album cards use cached manifest metadata only — full packages load lazily when you open or play.
