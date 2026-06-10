# Changelog

All notable changes to MP5 Audio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with pre-release tags (`-alpha`, `-beta-candidate`).

## [Unreleased]

_No changes yet._

## [0.16.2-beta] - 2026-05

### Milestone — Public Beta hardening + feedback loop

- In-app **Report a bug / Give feedback** (Settings) with GitHub Issues links; no telemetry.
- **Copy diagnostics** in Settings (version, browser, WASM/FFmpeg, last error, privacy note).
- GitHub issue templates: bug report, Beta feedback, MP5 compatibility, feature request.
- [`docs/MP5_PUBLIC_BETA_RELEASE_NOTES.md`](docs/MP5_PUBLIC_BETA_RELEASE_NOTES.md) and GitHub release draft.
- First-user guidance on landing and Demo guide; physical phone QA checklist (section L).

**Still not claimed:** production-ready, beats MP3/AAC/Opus/FLAC, DRM, legal proof, AI stems.

## [0.16.1-beta] - 2026-05

### Milestone — Public Beta

- **MP5 Audio v0.16.1-beta** — first **Public Beta** tag for the hosted demo at https://mp5-audio.vercel.app.
- Version badge: **MP5 Public Beta · v0.16.1-beta** (landing + in-app).
- Final local gates, package fixtures, and HADES local QA accepted before tag.
- Hosted verification and `test:e2e:hosted` **11/11** after deploy.

**Still not claimed:** production-ready, beats MP3/AAC/Opus/FLAC, DRM, legal proof, AI stems, universal support.

## [0.16.1-beta-candidate] - 2026-05

### Fixed — Hosted embedded album demo

- **Demo guide → Load embedded album demo** no longer switches to Player before ingest completes (race that dropped `pendingAlbumPackage` on first mount).
- Landing badge copy: **MP5 Beta Candidate** (was **MP5 Alpha**).
- Expanded hosted QA e2e (`test:e2e:hosted` 11/11) including embedded album, mobile viewport, diagnostics trace toggle.

### Milestone — Manual QA sign-off

- Hosted desktop + mobile QA pass at https://mp5-audio.vercel.app.
- **Ready to tag public Beta** (maintainer decision; still experimental, not production-ready).

## [0.16.0-beta-candidate] - 2026-05

### Milestone — Beta Candidate declaration

- First **Beta Candidate** release — public demo candidate at https://mp5-audio.vercel.app; still experimental, not production-ready.
- Version badge: **MP5 Beta Candidate · v0.16.0-beta-candidate**.
- All automated gates pass (`pnpm test`, `test:e2e`, `alpha:check`, `beta:check`, `playback:check`, `deploy:check`).
- Embedded `.mp5p` (incl. HADES-scale manual QA), hosted demo, and package validation accepted.

**Not claimed:** full public Beta, production-ready, beats MP3/AAC/Opus/FLAC, legal proof, DRM, universal support.

## [0.15.7-alpha] - 2026-05

### Fixed — Beta gate doc encoding

- `docs/MP5_MANUAL_QA_CHECKLIST.md` saved as UTF-8 (was UTF-16), fixing `betaReadiness.test.ts` / `alpha:check` failure on Windows.

### Milestone — Final local gate cleanup

- Clean `CI=1` runs: `test:e2e` (75/75), `alpha:check`, and `beta:check` all pass with port 5173 free.

## [0.15.6-alpha] - 2026-05

### Fixed — Embedded album playlist durations

- Loaded embedded tracks (e.g. first album row) show HEAD-derived duration instead of stale manifest half-length.
- Metadata prefetch updates duration on hydrated tracks; hydrate prefers decoded file duration over manifest.

### Milestone — Hosted demo lock

- Production deploy to https://mp5-audio.vercel.app accepted at **v0.15.6-alpha** (`hosted:verify`, `test:e2e:hosted`).
- Beta candidate readiness docs updated; HADES `.mp5p` manual QA accepted locally.

## [0.15.5-alpha] - 2026-05

### Fixed — Playlist Play on unloaded tracks

- Row **Play** on a track that has not been loaded yet starts playback and keeps playing (no brief blip then stop).
- Metadata prefetch no longer re-triggers track load when `parsed` is patched on placeholders.
- Duplicate embedded hydrate and redundant `loadFile` calls are guarded while play intent is preserved through decode.

## [0.15.4-alpha] - 2026-05

### Fixed — Playlist Play button

- Playlist row **Play** on the current track now starts playback without requiring the main transport Play button.
- Preserves play intent during track load when `playWhenReadyRef` is set.

## [0.15.3-alpha] - 2026-05

### Fixed — Embedded album playlist display

- Playlist placeholders show manifest title, artist, album, and genre before full track load.
- Background metadata prefetch loads cover art and HEAD durations for all queued embedded tracks.
- Create album package retains album year from embedded `.mp5p` manifest.

## [0.15.2-alpha] - 2026-05

### Fixed — Embedded album hotfix follow-up

- Album cover from first embedded track via metadata prefix parser (no full-file parse).
- Track durations in Album Details use HEAD sample count (fixes ~half-duration display for stereo).
- Playback overlap: serialized audio start, Play Album stops prior transport before queueing.

## [0.15.1-alpha] - 2026-05

### Fixed — Batch album / embedded MP5P hotfix

- Batch album metadata fields stay responsive after conversion (cached MP5 summaries, deferred preview, album title applied at export).
- Embedded album cover from first track when manifest has no album cover (fragment prefix read only).
- Play album queues all embedded tracks lazily; playback state and Play/Pause stay in sync (no overlap).
- Track duration display uses plausible manifest ms with HEAD fallback.

## [0.15.0-alpha] - 2026-05

**Status:** Experimental alpha — public Beta readiness / app polish; no format or codec changes.

### Added

- Welcome onboarding card (dismissible, localStorage); Demo guide paths A–E on Demo tab.
- Landing `.mp5` / `.mp5p` format explainer; “What works today” in Learn More.
- Embedded album demo fixture on hosted deploy; `importAlbumPackageToPlayer` helper.
- [`MP5_MANUAL_QA_CHECKLIST.md`](docs/MP5_MANUAL_QA_CHECKLIST.md); updated [`MP5_BETA_READINESS.md`](docs/MP5_BETA_READINESS.md).
- Diagnostics: app version, stem worker status, known-issues links.
- E2e: demo guide, onboarding smoke.

### Changed

- Mobile min tap targets (40px) for tabs and primary buttons.
- Expanded user-facing error copy for embedded tracks and stem worker fallback.

## [0.14.0-alpha] - 2026-05

**Status:** Experimental alpha — embedded album / MP5P UX polish; no format or codec policy changes.

### Added

- Polished album package view (cover, metadata, integrity, size warnings, album details panel).
- Tracklist badges and per-track Play / Queue / Extract actions.
- Lazy embedded track loading with loading status; album context in Now Playing.
- Save-to-library confirmations; Saved albums for manifest + embedded packages.
- Batch album export summary with Open in Player, Save to Library, Download again.
- Tests: expanded `tests/albumPackage.test.ts`; expanded `e2e/embedded-album-package.spec.ts`.

## [0.13.1-alpha] - 2026-05

**Status:** Experimental alpha — acceptance gate hardening only; no product behavior changes.

### Changed

- Playwright: serial workers + one retry under `CI=1`; shared `waitForPlaybackProgress` / `waitForSeekReady` helpers in playback e2e.
- Karaoke, playback-regression, stems, and highlights e2e use transport status + progress polls instead of tight fixed timeouts.
- Documented parallel e2e WASM/stem worker contention in `MP5_KNOWN_ISSUES.md`.

## [0.13.0-alpha] - 2026-05

**Status:** Experimental alpha — MP5-L v3 recommended; MP5-C/MP5-H experimental. Not production-ready. MP5 does not claim to beat MP3, AAC, Opus, or FLAC.

### Added

- Batch album export in Converter: metadata table, track reorder, manifest or embedded `.mp5p` from batch queue.
- Tests: `tests/batchAlbumBuilder.test.ts`, `e2e/batch-album-builder.spec.ts`.
- Open-source maintainer docs: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, GitHub Actions CI.
- Root `LICENSE` (MIT), `RELEASE_CHECKLIST.md`, `CHANGELOG.md`, and [`docs/GITHUB_RELEASE_v0.13.0-alpha.md`](docs/GITHUB_RELEASE_v0.13.0-alpha.md).

### Changed

- README polish: badges, table formatting, alpha status, security, and contributing links.
- Root acceptance logs moved to `logs/acceptance/` (generated artifacts, gitignored).
- Test split: `pnpm test` / `pnpm test:unit` (safe unit suite) vs `pnpm test:compatibility` (fixture generation + `compatibilityPass` tests).
- E2E CI generates synthetic compatibility fixtures before Playwright runs.

See [`docs/MP5_ALPHA_RELEASE_NOTES.md`](docs/MP5_ALPHA_RELEASE_NOTES.md) for full alpha release history.

## Earlier alpha releases

Detailed notes for v0.12.x, v0.11.x, v0.10.x, and earlier milestones are in:

- [`docs/MP5_ALPHA_RELEASE_NOTES.md`](docs/MP5_ALPHA_RELEASE_NOTES.md)
- [`docs/CURRENT_MP5_STATUS.md`](docs/CURRENT_MP5_STATUS.md)

[Unreleased]: https://github.com/cjocollin/MP5-audio/compare/v0.16.2-beta...HEAD
[0.16.2-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.16.1-beta...v0.16.2-beta
[0.16.1-beta]: https://github.com/cjocollin/MP5-audio/compare/v0.16.1-beta-candidate...v0.16.1-beta
[0.16.1-beta-candidate]: https://github.com/cjocollin/MP5-audio/compare/v0.16.0-beta-candidate...v0.16.1-beta-candidate
[0.16.0-beta-candidate]: https://github.com/cjocollin/MP5-audio/compare/v0.15.7-alpha...v0.16.0-beta-candidate
[0.15.7-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.6-alpha...v0.15.7-alpha
[0.15.6-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.5-alpha...v0.15.6-alpha
[0.15.5-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.4-alpha...v0.15.5-alpha
[0.15.4-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.3-alpha...v0.15.4-alpha
[0.15.3-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.2-alpha...v0.15.3-alpha
[0.15.2-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.1-alpha...v0.15.2-alpha
[0.15.1-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.0-alpha...v0.15.1-alpha
[0.15.0-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.14.0-alpha...v0.15.0-alpha
[0.14.0-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.13.1-alpha...v0.14.0-alpha
[0.13.1-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.13.0-alpha...v0.13.1-alpha
[0.13.0-alpha]: https://github.com/cjocollin/MP5-audio/releases/tag/v0.13.0-alpha
