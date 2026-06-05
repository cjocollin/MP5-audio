# Changelog

All notable changes to MP5 Audio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with `-alpha` pre-release tags.

## [Unreleased]

_No changes yet._

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

[Unreleased]: https://github.com/cjocollin/MP5-audio/compare/v0.15.1-alpha...HEAD
[0.15.1-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.15.0-alpha...v0.15.1-alpha
[0.15.0-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.14.0-alpha...v0.15.0-alpha
[0.14.0-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.13.1-alpha...v0.14.0-alpha
[0.13.1-alpha]: https://github.com/cjocollin/MP5-audio/compare/v0.13.0-alpha...v0.13.1-alpha
[0.13.0-alpha]: https://github.com/cjocollin/MP5-audio/releases/tag/v0.13.0-alpha
