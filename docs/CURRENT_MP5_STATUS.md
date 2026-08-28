# Current MP5 Status

**Version:** MP5 Audio v0.30.1-beta (Public Beta)
**Last updated:** 2026-08-28

## What MP5 Is Today

MP5 is an experimental, browser-based music format and player stack. The hosted demo at [https://mp5-audio.vercel.app](https://mp5-audio.vercel.app) is a Public Beta preview, not a production archival, legal-proof, or rights-enforcement system.

## Format Policy

| Format | Role |
|--------|------|
| MP5-L v4 | Default and recommended for playback/export (Converter default; batch export) |
| MP5-L v3 | Lab/legacy bitstream; still decodable and offered under lab/advanced, not default |
| MP5-C classic (legacy) | Lab/research only (`CodecId` 1); may hiss; not default |
| MP5-C2 (vNext) | Lab/advanced **lossless / bit-exact** (`CodecId` 5, AUDI `0x43 0x34`); gated; not default; ~1.07x MP5-L size |
| MP5-H | Large/experimental hybrid; not default |
| PCM | Reference/debug fallback |
| `.mp5p` | Experimental album package; browser memory limits apply |

## v0.30.1-beta Milestone

- **Native player integration:** installed `.mp5` and `.mp5p` launches route into the player; Media Session exposes metadata, transport, and seek actions.
- **Reactive VISU:** independent rounded bars use real playback analysis plus the active track's VISU palette; reduced motion stays static.
- **Opt-in gapless albums:** album metadata controls decoded-buffer scheduling. Shuffle, repeat, stems, ranges, and ordinary queues retain their prior transitions.
- **Converter audition:** retained source PCM and the exported MP5 share one clamped playhead for immediate A/B switching.
- **Library safety:** browser-local tracks and packages can be verified and copied to a user-selected folder without upload or a new archive format.

This milestone changes app behavior only. It adds no format chunks or codec semantics.

## v0.26.0-beta Milestone (previous)

Quality-preserving compression and vNext size/UX pass:

- **MP5-L:** `FLAG_RICE_PACKED`, rice-aware LPC order, FLAC-style 4-mode stereo.
- **vNext:** protect **1.5**, loud + L/B coalesce, prefer High loud preset; gated `CodecId.MP5C2`.

## v0.25.0-beta Milestone (previous)

v0.25.0-beta ported the winning **vNext "smooth"** engine into the **native Rust codec**:

- New `rust/mp5-codec/src/mp5c2.rs`, WASM `encode_mp5c_vnext` / `decode_mp5c_vnext`, bit-identical to the JS prototype; `reverb_tail` hiss risk **low**.
- **Done safely:** MP5-C (v5.1) byte-identical; distinct AUDI magic `0x43 0x34`.

## v0.24.0-beta Milestone (previous)

v0.24.0-beta added **hysteresis + lookahead tail protection** (`mp5c2-smooth-extreme`), taking `reverb_tail` to hiss risk **low** (quiet *and* tail windows bit-exact); a **noise-shaping** experiment was tried and measured worse (rejected with data); and the Playwright e2e **port 5173 collision** was fixed with a dedicated port (`E2E_PORT`, default 5188).

## v0.23.0-beta Milestone (previous)

v0.23.0-beta moved MP5-C vNext from block-granular to **sub-block (~23 ms) + per-band** quiet detection (`mp5c2-subblock`, `mp5c2-bandquiet`, `mp5c2-bandquiet-extreme`), taking `reverb_tail` from hiss risk severe/high → **medium** (lossless coverage 56.7% → 74.5%) while keeping silence/quiet bit-exact and wasting no fallback on loud material.

## v0.22.0-beta Milestone (previous)

v0.22.0-beta was the **MP5-C Hiss Audit + vNext Listening Lab**: `.mp5`-file comparison tooling (`audio:inspect`/`compare-files`/`compare-set`/`hiss-report`) with a decode self-test, hiss-specific metrics and a committed **Hiss Risk** rating, and the first runnable vNext (block-level). It documented the root cause — MP5-C quantizes in the time domain with a full-scale-relative step (no MDCT) — and confirmed MP5-C can be *larger* than MP5-L on real tracks. See [MP5C_HISS_AUDIT.md](./MP5C_HISS_AUDIT.md).

## v0.21.0-beta Milestone (previous)

v0.21.0-beta added the **MP5 Audio Quality / Codec Lab** ([MP5_AUDIO_QUALITY_LAB.md](./MP5_AUDIO_QUALITY_LAB.md)): the `tools/audio-lab/` harness, synthetic fixtures, honest metrics (quiet-window SNR, silence residual, null test), and the first default-OFF MP5-C vNext prototype — all without changing MP5-L's default/recommended policy.

## v0.20.0-beta Milestone (previous)

v0.20.0-beta was a spec / developer toolkit polish release:

- Current docs for specs, chunk registry, compatibility matrix, quickstart, fixture catalog, known issues, and hosted demo.
- Clearer `inspect:mp5` / `validate:mp5` / `validate:mp5p` help and profile wording.
- Tests covering toolkit docs, registry limits, public claims, and CLI help text.
- No codec work, playback transport rewrite, converter encoding behavior change, MP5/STDF/MP5P format semantics change, telemetry, upload, cloud sync, or private/copyrighted test audio.

## Player / Listening UX

- Now Playing shows normalized title, artist, album, cover fallback, codec/profile, source type, album track position, time/duration/remaining, embedded hydration, and local integrity state when available.
- Queue and album views distinguish `.mp5`, manifest `.mp5p`, and embedded `.mp5p` sources.
- Timeline, waveform, lyrics/karaoke, stems, and VISU remain UI/display polish only. VISU can theme app accents while neutral surfaces and cover-art containment are preserved.
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
- [MP5_AUDIO_QUALITY_LAB.md](./MP5_AUDIO_QUALITY_LAB.md)
- [MP5_CODEC_STATUS.md](./MP5_CODEC_STATUS.md)

## Local Library

| Item | Storage |
|------|---------|
| Saved `.mp5` tracks | IndexedDB (`mp5-local-library`) |
| Manifest `.mp5p` albums | localStorage (`mp5-saved-albums-v1`) |
| Embedded `.mp5p` packages | IndexedDB blob + localStorage metadata (`mp5-saved-embedded-albums-v1`) |
| Recently opened | localStorage metadata only (`mp5-recent-library-v1`) |

Nothing is uploaded. Embedded album cards use cached manifest metadata until a package is opened or played.
