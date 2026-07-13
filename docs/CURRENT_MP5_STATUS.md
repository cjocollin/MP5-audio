# Current MP5 Status

**Version:** MP5 Audio v0.25.0-beta (Public Beta)  
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

## v0.25.0-beta Milestone

v0.25.0-beta ports the winning **vNext "smooth"** engine into the **native Rust codec** ([MP5C_VNEXT_RESULTS.md](./MP5C_VNEXT_RESULTS.md)):

- New `rust/mp5-codec/src/mp5c2.rs` (sub-block + per-band + hysteresis lossless fallback), exposed via additive WASM `encode_mp5c_vnext` / `decode_mp5c_vnext`. It is **bit-identical to the JS prototype** (parity SNR = ∞), reaches `reverb_tail` hiss risk **low**, and runs at native speed (lab mode `mp5c2-native-extreme`).
- **Done safely:** the existing **MP5-C (v5.1) is byte-identical** (the `mp5c` module was not modified; full JS + Rust suites pass against the rebuilt WASM). The vNext stream uses a distinct `0x43 0x34` magic, has **no public `CodecId`**, is **not in the Converter**, and is **never written into `.mp5`** — still lab-only / default OFF.
- **No change** to MP5-L default/recommended policy, MP5-C public behavior, MP5/MP5P semantics, or the playback harness.

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
