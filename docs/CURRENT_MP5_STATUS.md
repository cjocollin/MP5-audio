# Current MP5 Status

**Version:** MP5 Audio v0.19.0-beta (Public Beta)
**Last updated:** 2026-06-16

## What MP5 is today

MP5 is an **experimental, browser-based** music format and player stack. The hosted demo at [https://mp5-audio.vercel.app](https://mp5-audio.vercel.app) is a **Public Beta** preview — not a production-ready archival or legal-proof system.

## Format policy (unchanged)

| Format | Role |
|--------|------|
| **MP5-L v3** | Default and recommended for playback and export |
| **MP5-C** | Lab / research only — not default |
| **MP5-H** | Large / experimental — not default |
| **`.mp5p`** | Experimental album package — browser memory limits apply |

## Exporting & packages

- **MP5-L v3** is the recommended lossless default for all exports. **MP5-C** is lab-only and never the default. The batch and album builders always use MP5-L.
- **Manifest `.mp5p`** is a small index that references separate sidecar `.mp5` files — easy to inspect, but the files must travel together.
- **Embedded `.mp5p`** packs every track into one self-contained file — easiest to share, but can be large and use significant browser memory/storage.
- All conversion and packaging happens **locally in your browser** — nothing is uploaded, no cloud sync, no telemetry.
- Large packages (HADES-scale) remain possible locally but are clearly flagged as heavy; deep validation of very large embedded packages may be deferred to CLI tools.
- **Keep your original source files backed up** — exports never replace them. MP5 performs **no rights/legal verification** and makes **no claim** to beat MP3/AAC/Opus/FLAC.

## Player / Listening UX

- Now Playing shows normalized title, artist, album, cover art fallback, codec/profile, source type, album track position, current time, duration, remaining time, embedded hydration, and local integrity status when available.
- Queue rows and album views stay connected: current rows are clearer, package source badges distinguish `.mp5`, manifest `.mp5p`, and embedded `.mp5p`, and embedded metadata is used without full package decoding for row rendering.
- Timeline, waveform, lyrics/karaoke, stems, and VISU are display/UI polish only. The playback transport, MP5-L lossless behavior, MP5-C lab-only policy, STDF behavior, and MP5P semantics are unchanged.
- Diagnostics remain manual/copyable and path-redacted. No telemetry, no upload, no cloud sync.

## Recent milestone

- **v0.19.0-beta** — Player / Listening UX polish: clearer Now Playing, queue/album context, timeline/waveform, lyrics/karaoke, stems, VISU fallback, mobile controls, and playback/error state labels. No transport, codec, or format-policy changes.
- **v0.18.0-beta** — Export / Package polish: pre-export review step, package preflight + post-export validation, safe/de-duplicated filenames, manifest-vs-embedded guidance, copyable export/error summaries, and export context in diagnostics. No format or codec policy changes.
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
