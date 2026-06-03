# GitHub release draft — v0.13.0-alpha

Copy this into the GitHub release form when tagging **`v0.13.0-alpha`**.

**Title:** `v0.13.0-alpha`

**Tag:** `v0.13.0-alpha` (target: `main`)

**Pre-release:** Yes (alpha)

---

## MP5 Audio v0.13.0-alpha

**Status:** Experimental alpha — not production-ready.

MP5 is an open-source audio format, container, codec, converter, and player project for research, validation tooling, and browser-based workflows. **MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

### Codec policy (honest)

| Mode | Role |
|------|------|
| **MP5-L v3** | **Recommended** — lossless, bit-exact |
| **PCM** | Reference / debug fallback |
| **MP5-C** | **Experimental** — lab-only; known hiss/artifact limitations |
| **MP5-H** | **Experimental** — hybrid + CORR; large files; not default |

### Highlights in this tag

- Batch album export MVP (metadata table, track order, manifest or embedded `.mp5p`)
- Open-source maintainer docs: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue/PR templates
- GitHub Actions CI: lint, unit tests, compatibility fixture gate, Rust/WASM build, E2E
- MIT `LICENSE` file

### Try it

- **Live demo:** https://mp5-audio.vercel.app
- **Local:** `pnpm install && pnpm wasm:build && pnpm demo`

### Verify

```bash
pnpm lint
pnpm test:unit
pnpm test:compatibility
pnpm build
```

Full gate: `pnpm alpha:check`

### Security

MP5 parses binary media files. Do not open untrusted `.mp5` / `.mp5p` in production yet. Report parser crashes, hangs, or memory issues privately via [SECURITY.md](https://github.com/cjocollin/MP5-audio/blob/main/SECURITY.md).

### Full notes

- [CHANGELOG.md](https://github.com/cjocollin/MP5-audio/blob/main/CHANGELOG.md)
- [docs/MP5_ALPHA_RELEASE_NOTES.md](https://github.com/cjocollin/MP5-audio/blob/main/docs/MP5_ALPHA_RELEASE_NOTES.md)
- [docs/MP5_KNOWN_ISSUES.md](https://github.com/cjocollin/MP5-audio/blob/main/docs/MP5_KNOWN_ISSUES.md)
