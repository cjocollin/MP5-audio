# MP5 — Experimental Smart Audio Format (Alpha Demo)

**MP5** is a general-purpose experimental smart audio format (`.mp5`) — music, podcasts, and apps — with custom codecs in Rust/WASM and a web player + converter.

## Codec policy (all Alpha docs use this)

| Codec | Role |
|-------|------|
| **MP5-L v3** | **Default / recommended** — lossless, bit-exact, modest compression |
| **PCM** | **Reference / debug** — uncompressed samples in the container |
| **MP5-H** | **Hybrid** — MP5-C base + lossless CORR; **clean when CORR is applied**, but **large**; not default |
| **MP5-C** | **Lab-only / experimental** — lossy; may **hiss** on all presets; not for normal listening |

**MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

## In 60 seconds

- **MP5** is a general-purpose smart audio format — not a drop-in replacement for established codecs.
- Optional metadata supports lyrics, content guidance, mood/vibe, and specialized app profiles; the web **player** queues multiple `.mp5` files with search, auto-advance, repeat, and shuffle (never required for playback).
- **MP5-L v3** is the **default and recommended** export for listening-quality files.
- **MP5-C** is lab-only (may hiss). **MP5-H** is hybrid (clean with CORR, but large). **PCM** is reference/debug only.
- **MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

**Demo someone?** → [`docs/MP5_DEMO_GUIDE.md`](docs/MP5_DEMO_GUIDE.md)

## Quick start

```bash
pnpm install
pnpm wasm:build    # required for MP5-L — see docs/WASM_SETUP.md
pnpm demo          # checks setup, starts http://localhost:5173
```

Or `pnpm dev` directly. On first visit, a **welcome panel** explains MP5-L vs lab codecs and how to convert/play. Use **Load MP5-L demo** for a synthetic tone (no copyrighted audio), or the **Demo** tab for a step-by-step walkthrough.

**Release checklist:** [`docs/MP5_ALPHA_RELEASE_CHECKLIST.md`](docs/MP5_ALPHA_RELEASE_CHECKLIST.md)

**Try without converting:** drop `test-fixtures/demo_mp5l_v3_tone.mp5` on the Player tab.

**Convert:** Converter tab → drop FLAC/WAV → edit metadata → **Export MP5** (MP5-L v3 default) → summary + **Open in Player** or download `Artist - Title.mp5`.

**Metadata:** track info, cover, lyrics, optional content guidance (manual only) — see [`docs/MP5_METADATA_SPEC.md`](docs/MP5_METADATA_SPEC.md).

## Alpha verification

Before a demo or handoff, run the full Alpha gate:

```bash
pnpm alpha:check
```

This runs, in order:

1. `pnpm fixtures:generate` — rebuild WASM demo fixtures
2. `pnpm test` — Vitest unit tests
3. `cargo test -p mp5-codec --release` — Rust codec tests
4. `node scripts/validate-demo-fixtures.mjs` — parse demo `.mp5` files
5. `pnpm test:e2e` — Playwright player/converter smoke tests

Expect a few minutes (WASM build included). All steps must pass for **demo-ready** status.

## Project layout

| Path | Purpose |
|------|---------|
| `apps/web/` | Player + converter UI |
| `packages/mp5-container/` | `.mp5` parser/writer |
| `rust/mp5-codec/` | MP5-L / MP5-C / MP5-H (WASM) |
| `test-fixtures/` | Synthetic demo tones (no copyrighted audio) |
| `docs/` | Specs, demo guide, release notes |

## Deploy web demo

→ [`docs/MP5_DEPLOYMENT_GUIDE.md`](docs/MP5_DEPLOYMENT_GUIDE.md) · Hosted validation: [`docs/MP5_HOSTED_DEMO.md`](docs/MP5_HOSTED_DEMO.md)

```bash
pnpm build
pnpm deploy:check
pnpm demo:prod          # production preview :4173
```

## Install & share (PWA / platforms)

Primary Alpha distribution is the **web app / PWA**. Desktop (Tauri) and mobile (Capacitor) are scaffolds only.

→ [`docs/MP5_INSTALL_GUIDE.md`](docs/MP5_INSTALL_GUIDE.md)

```bash
pnpm icons:generate   # if icons missing
pnpm build            # apps/web/dist
pnpm pwa:check
```

## Docs

- [Install guide](docs/MP5_INSTALL_GUIDE.md)
- [Metadata spec (MVP)](docs/MP5_METADATA_SPEC.md)
- [Demo guide](docs/MP5_DEMO_GUIDE.md)
- [Alpha release notes](docs/MP5_ALPHA_RELEASE_NOTES.md)
- [Current status](docs/CURRENT_MP5_STATUS.md)
- [Roadmap](docs/MP5_ROADMAP.md)

## License

MIT — experimental research prototype.
