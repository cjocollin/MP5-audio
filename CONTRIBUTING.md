# Contributing to MP5 Audio

Thank you for your interest in MP5 Audio. This project is an **experimental alpha** research codebase — contributions that improve clarity, validation, and honest documentation are especially welcome.

## Project overview

MP5 is an open-source audio format, container, codec, converter, and player project. It explores metadata-rich audio packaging, browser playback, Rust/WASM codec work, validation tooling, and developer-facing specs.

**Recommended path for most work:** **MP5-L v3** (lossless, bit-exact).  
**Experimental paths:** **MP5-C** (lossy lab codec — known hiss/artifact limitations) and **MP5-H** (hybrid — large files, CORR-dependent). Test these carefully and do not treat them as production-ready.

See also [`README.md`](README.md), [`docs/CURRENT_MP5_STATUS.md`](docs/CURRENT_MP5_STATUS.md), and [`docs/MP5_KNOWN_ISSUES.md`](docs/MP5_KNOWN_ISSUES.md).

## Development setup

### Prerequisites

- **Node.js 20+**
- **pnpm 9** (see `packageManager` in root `package.json`)
- **Rust** (for codec crates and WASM build) — https://rustup.rs/
- **wasm-pack** (for browser codecs) — see [`docs/WASM_SETUP.md`](docs/WASM_SETUP.md)
- **Windows:** MSVC Build Tools if linking fails during WASM build

### Install

From the repository root:

```bash
pnpm install
```

### Build

```bash
# TypeScript container package
pnpm --filter @mp5/container build

# Rust → WASM codecs (required for MP5-L/C/H in the web app)
pnpm wasm:build

# Full monorepo build (container + web app)
pnpm build
```

### Test

```bash
# Unit / integration tests (Vitest)
pnpm test

# Watch mode
pnpm test:watch

# TypeScript checks across workspace packages
pnpm lint

# Rust codec tests (native — recommended for CI)
cargo test -p mp5-codec

# Golden fixture validation
pnpm fixtures:validate

# Full Alpha gate (fixtures, vitest, Rust, validation, playback, E2E)
pnpm alpha:check
```

### Run the web app / demo

```bash
# Recommended: checks setup and starts dev server
pnpm demo
# → http://localhost:5173

# Or start dev server directly
pnpm dev
```

Hosted reference demo: https://mp5-audio.vercel.app

### Codec and container tests

| Task | Command |
|------|---------|
| Inspect a file | `pnpm inspect:mp5 <file.mp5>` |
| Validate against profiles | `pnpm validate:mp5 <file> [--profile rich\|playable]` |
| Validate album package | `pnpm validate:mp5p <file.mp5p> --dir <folder>` |
| Regenerate synthetic fixtures | `pnpm fixtures:generate` |
| Compatibility fixtures + tests | `pnpm compatibility:check` |
| Rust MP5-C bench report | `pnpm bench:mp5c` |
| Playback regression gate | `pnpm playback:check` |
| Browser E2E (Playwright) | `pnpm test:e2e` |

## Adding fixtures safely

MP5 fixtures live in `test-fixtures/`. **Only commit synthetic or explicitly licensed test audio.**

1. **Do not commit copyrighted music.** The repo ignores `*.flac`, `*.wav`, `*.mp3`, `*.m4a`, `*.ogg`, etc. Use generated sine tones or your own cleared material locally only.
2. **Prefer small files.** Demo tones are ~2 s mono sine waves unless a test requires more.
3. **Regenerate via scripts** when possible:
   ```bash
   pnpm fixtures:generate
   pnpm compatibility:fixtures
   ```
4. **Document new fixtures** in [`test-fixtures/README.md`](test-fixtures/README.md).
5. **Run validation** before opening a PR:
   ```bash
   pnpm fixtures:validate
   pnpm validate:mp5 test-fixtures/your_fixture.mp5
   ```
6. **Parser negative tests** (truncated/corrupt files) belong under `test-fixtures/compatibility/` with clear expected failure behavior.

## Coding standards

- **Match existing style** in the file you edit (TypeScript in `apps/web` and `packages/mp5-container`, Rust in `rust/mp5-codec`).
- **Keep changes focused.** Prefer small, reviewable PRs over large rewrites.
- **TypeScript:** run `pnpm lint` before submitting. Web app uses React 19 + Vite; container package is plain TS.
- **Rust:** `cargo fmt` and `cargo clippy` are appreciated when touching codec code.
- **Honest UX copy.** Do not claim production readiness, industry adoption, or superiority over MP3/AAC/Opus/FLAC.
- **Parser/container changes** should include validation or fixture coverage where practical.
- **Codec changes** should note limitations; include before/after or benchmark notes when behavior changes audibly.

## Commit and PR expectations

1. **One logical change per PR** when possible (feature, fix, docs, or test pass).
2. **Tests pass** — at minimum `pnpm lint`, `pnpm test`, and `cargo test -p mp5-codec` for relevant changes.
3. **Docs updated** if you change user-facing behavior, CLI commands, or codec policy.
4. **No copyrighted media** in commits.
5. **No false performance claims** in README, UI strings, or comments.
6. **Fill out the PR template** checklist.
7. **Link related issues** when applicable.

We review contributions as time allows. Alpha status means APIs, chunk layouts, and UX may still change.

## Security

MP5 parses binary container and audio data. If you find a crash, hang, or memory issue from malformed input, **do not open a public issue** — see [`SECURITY.md`](SECURITY.md).

## Questions

Open a [GitHub Discussion or Issue](https://github.com/cjocollin/MP5-audio/issues) for bugs, feature ideas, or questions. Use the issue templates when available.

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT).
