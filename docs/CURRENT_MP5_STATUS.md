# Current MP5 Status

**Version:** MP5 Audio v0.20.0-beta (Public Beta)  
**Last updated:** 2026-06-16

## What MP5 Is Today

MP5 is an experimental, browser-based music format and player stack. The hosted demo at [https://mp5-audio.vercel.app](https://mp5-audio.vercel.app) is a Public Beta preview, not a production archival, legal-proof, or rights-enforcement system.

## Format Policy

| Format | Role |
|--------|------|
| MP5-L v3 | Default and recommended for playback/export |
| MP5-C | Lab/research only; may hiss; not default |
| MP5-H | Large/experimental hybrid; not default |
| PCM | Reference/debug fallback |
| `.mp5p` | Experimental album package; browser memory limits apply |

## v0.20.0-beta Milestone

v0.20.0-beta is a spec / developer toolkit polish release:

- Current docs for specs, chunk registry, compatibility matrix, quickstart, fixture catalog, known issues, and hosted demo.
- Clearer `inspect:mp5` / `validate:mp5` / `validate:mp5p` help and profile wording.
- Tests covering toolkit docs, registry limits, public claims, and CLI help text.
- No codec work, playback transport rewrite, converter encoding behavior change, MP5/STDF/MP5P format semantics change, telemetry, upload, cloud sync, or private/copyrighted test audio.

## Player / Listening UX

- Now Playing shows normalized title, artist, album, cover fallback, codec/profile, source type, album track position, time/duration/remaining, embedded hydration, and local integrity state when available.
- Queue and album views distinguish `.mp5`, manifest `.mp5p`, and embedded `.mp5p` sources.
- Timeline, waveform, lyrics/karaoke, stems, and VISU remain UI/display polish only. VISU stays contained to the player visual area.
- Diagnostics remain manual/copyable and path-redacted.

## Honest Limits

- Does not claim to beat MP3, AAC, Opus, or FLAC.
- Does not enforce DRM or provide legal proof.
- No automated stem separation in the product.
- No telemetry, upload, or cloud sync.
- Large albums and stems can be heavy in the browser.
- Not production-ready for archival or legal use.

## Current Docs

- [MP5_PUBLIC_BETA_RELEASE_NOTES.md](./MP5_PUBLIC_BETA_RELEASE_NOTES.md)
- [MP5_BETA_READINESS.md](./MP5_BETA_READINESS.md)
- [MP5_KNOWN_ISSUES.md](./MP5_KNOWN_ISSUES.md)
- [MP5_HOSTED_DEMO.md](./MP5_HOSTED_DEMO.md)
- [MP5_DEVELOPER_QUICKSTART.md](./MP5_DEVELOPER_QUICKSTART.md)
- [MP5_COMPATIBILITY_MATRIX.md](./MP5_COMPATIBILITY_MATRIX.md)
- [MP5_FIXTURE_CATALOG.md](./MP5_FIXTURE_CATALOG.md)
- [MP5_CHUNK_REGISTRY.md](./MP5_CHUNK_REGISTRY.md)

## Local Library

| Item | Storage |
|------|---------|
| Saved `.mp5` tracks | IndexedDB (`mp5-local-library`) |
| Manifest `.mp5p` albums | localStorage (`mp5-saved-albums-v1`) |
| Embedded `.mp5p` packages | IndexedDB blob + localStorage metadata (`mp5-saved-embedded-albums-v1`) |
| Recently opened | localStorage metadata only (`mp5-recent-library-v1`) |

Nothing is uploaded. Embedded album cards use cached manifest metadata until a package is opened or played.
