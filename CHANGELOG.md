# Changelog

All notable changes to MP5 Audio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with `-alpha` pre-release tags.

## [Unreleased]

### Added

- Open-source contributor docs: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, GitHub issue/PR templates, and GitHub Actions CI.
- Root `RELEASE_CHECKLIST.md` and this `CHANGELOG.md`.

### Changed

- README polish for alpha status, quick start, security, and contributing links.
- Root acceptance logs moved to `logs/acceptance/` (generated artifacts).

## [0.13.0-alpha] - 2026-05

**Status:** Experimental alpha — MP5-L v3 recommended; MP5-C/MP5-H experimental.

### Added

- Batch album export in Converter: metadata table, track reorder, manifest or embedded `.mp5p` from batch queue.
- Tests: `tests/batchAlbumBuilder.test.ts`, `e2e/batch-album-builder.spec.ts`.

See [`docs/MP5_ALPHA_RELEASE_NOTES.md`](docs/MP5_ALPHA_RELEASE_NOTES.md) for full alpha release history.

## Earlier alpha releases

Detailed notes for v0.12.x, v0.11.x, v0.10.x, and earlier milestones are in:

- [`docs/MP5_ALPHA_RELEASE_NOTES.md`](docs/MP5_ALPHA_RELEASE_NOTES.md)
- [`docs/CURRENT_MP5_STATUS.md`](docs/CURRENT_MP5_STATUS.md)

[Unreleased]: https://github.com/cjocollin/MP5-audio/compare/v0.13.0-alpha...HEAD
[0.13.0-alpha]: https://github.com/cjocollin/MP5-audio/releases/tag/v0.13.0-alpha
