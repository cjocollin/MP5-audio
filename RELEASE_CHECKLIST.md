# MP5 Alpha release checklist

Use this before tagging an alpha release or publishing GitHub release notes. For day-to-day demo prep, see also [`docs/MP5_ALPHA_RELEASE_CHECKLIST.md`](docs/MP5_ALPHA_RELEASE_CHECKLIST.md).

## Version and changelog

- [ ] Bump version in root `package.json`, `apps/web/package.json`, and `apps/web/src/generated/appVersion.ts` (via `scripts/sync-app-version.mjs` / release script)
- [ ] Update [`CHANGELOG.md`](CHANGELOG.md) — move items from **Unreleased** to the new version section
- [ ] Add or update entry in [`docs/MP5_ALPHA_RELEASE_NOTES.md`](docs/MP5_ALPHA_RELEASE_NOTES.md)
- [ ] Confirm [`README.md`](README.md) **Current status**, badges, and version line match the release

## Build and test

- [ ] `pnpm install`
- [ ] `pnpm --filter @mp5/container build`
- [ ] `pnpm wasm:build`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit` (or `pnpm test`)
- [ ] `pnpm test:compatibility` (or `pnpm compatibility:check`)
- [ ] `cargo test -p mp5-codec --release`
- [ ] `pnpm fixtures:validate`
- [ ] `pnpm build`
- [ ] `pnpm alpha:check` (full gate before major tags) or at minimum `pnpm playback:check` + `pnpm test:e2e`

## Demo and codecs

- [ ] `pnpm demo` — converter shows WASM ready; player loads synthetic fixture
- [ ] **MP5-L roundtrip** — bit-exact / null test on reference material (see `benchmarks/real-music/` docs)
- [ ] **MP5-C known limitations** reviewed — hiss/artifact warnings still accurate in UI and docs
- [ ] **MP5-H** — not promoted as default; CORR/size caveats still documented

## Fixtures and media

- [ ] Golden fixtures regenerated if container/codec changed: `pnpm fixtures:generate`
- [ ] Compatibility fixtures updated if needed: `pnpm compatibility:fixtures`
- [ ] No copyrighted audio committed — only `test-fixtures/` synthetic tones and documented assets

## Documentation honesty

- [ ] No claims of production readiness, industry adoption, or superiority over MP3/AAC/Opus/FLAC
- [ ] [`docs/MP5_KNOWN_ISSUES.md`](docs/MP5_KNOWN_ISSUES.md) reflects new limitations
- [ ] [`SECURITY.md`](SECURITY.md) and supported-version note still accurate

## Publish

- [ ] All checklist items pass locally (and CI green on `main`)
- [ ] Git tag created: `vX.Y.Z-alpha`
- [ ] GitHub release drafted using [`docs/GITHUB_RELEASE_v0.13.0-alpha.md`](docs/GITHUB_RELEASE_v0.13.0-alpha.md), link to `CHANGELOG.md`, demo URL https://mp5-audio.vercel.app
- [ ] Deploy verification if hosting changed: `pnpm deploy:check`, `pnpm vercel:check`

## Post-release

- [ ] Open **Unreleased** section in `CHANGELOG.md` for the next cycle
- [ ] Archive acceptance logs under `logs/acceptance/` if useful (optional, gitignored by default)
