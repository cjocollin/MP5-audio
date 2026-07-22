# MP5 Compatibility Matrix

**Version:** MP5 Audio v0.28.0-beta

This matrix describes current Public Beta support. It does not change MP5, STDF, MP5P, LYRC, VISU, or metadata semantics.

Status key:

- **Public Beta:** supported by current app/tooling with known beta limits.
- **Experimental:** implemented, but heavy, specialized, or still rough.
- **Lab-only:** available for research/testing, not recommended for normal distribution.
- **Reference/debug:** useful for tests or fallback behavior.
- **Future/registry:** documented or reserved, not implemented as a user feature.
- **Unsupported:** not currently supported.

## Codecs and payloads

| Item | Status | Notes | Validation |
|------|--------|-------|------------|
| MP5-L v4 | Public Beta | Recommended/default lossless path; bit-exact roundtrip; packed Rice (`FLAG_RICE_PACKED`) needs current decoder. | `inspect:mp5`, `validate:mp5`, unit/compat gates |
| MP5-L v3 | Lab-only / legacy | Backward-compatible bit-exact decode; legacy export remains under Lab/advanced; not default. | v3 golden fixtures, `inspect:mp5`, `validate:mp5`, compatibility gates |
| MP5-C | Lab-only | Experimental lossy codec; may hiss; not default. | Reports as lab codec with warnings |
| MP5-C2 (vNext) | Lab-only / advanced UI | Hybrid quiet→MP5-L + loud→MP5-C; AUDI `0x43 0x34`; CodecId 5; not default; batch stays MP5-L. | Converter advanced toggle; player `decode_mp5c_vnext` |
| MP5-H | Experimental | Hybrid/CORR path can be large; not default. | Playable when structure validates |
| PCM | Reference/debug | Fallback/reference payload for tests and debug flows. | `validate:mp5` basic/playable |
| External passthrough | Future/registry | Codec ID reserved; not a distribution promise. | Not a beta workflow |

## Containers and packages

| Item | Status | Notes | Validation |
|------|--------|-------|------------|
| `.mp5` | Public Beta | Single-track MP5A container. `HEAD` + `AUDI` are required for playback. | `pnpm inspect:mp5 <file.mp5>` |
| `.mp5p` manifest | Experimental | JSON album manifest referencing sidecar `.mp5` files. Sidecars must travel with the manifest. Also called manifest `.mp5p`. | `pnpm validate:mp5p <file.mp5p> --dir <folder> --profile package` |
| `.mp5p` embedded | Experimental | Self-contained MP5P binary package with manifest, directory, fragments, CRC, and optional hashes. Can be large. Also called embedded `.mp5p`. | `pnpm validate:mp5p <file.mp5p> --profile package` |
| ALBM chunk | Experimental | In-file album manifest JSON; optional metadata, not required for playback. | Parsed/validated when present |

## Optional metadata chunks

| Chunk / feature | Status | Notes | Validation |
|-----------------|--------|-------|------------|
| META | Public Beta | Title, artist, album, and key/value metadata. | Parser + inspect report |
| COVR | Public Beta | Cover art bytes + MIME; app uses size guardrails. | Parser + metadata tests |
| LYRC | Public Beta | Synced/unsynced lyrics and karaoke display. | LYRC unit/e2e tests |
| SECT / HOOK / HILT | Experimental | Manual song sections, hook, and highlight moments. | Section parser tests |
| VISU | Public Beta | Visual metadata for player UI only; no audio effect. | VISU tests + hosted containment checks |
| EXPL / SAFE / RECV / SENS | Experimental | Optional content guidance. | Content warning tests |
| MOOD / VIBE | Experimental | Optional descriptive tags. | Optional metadata parsing |
| FING / HASH | Experimental | Local duplicate/integrity helpers; not DRM or legal proof. | Integrity tests |
| CRDT / LICN / IDEN | Experimental | Credits, rights notes, release IDs; informational only. | Credits/rights tests |

## Stems

| Item | Status | Notes | Validation |
|------|--------|-------|------------|
| STEM manifest | Experimental | Artist/user-provided stems only; no AI stem separation. | Stem manifest tests |
| STDA | Experimental | Single stem-data chunk for small stem sets. | Stem fixture validation |
| STDF | Experimental | Segmented stem fragments for large stem sets; CRC checked per fragment. | STDF tests and playback gate |
| Stem mixer UI | Experimental | Lazy/selective playback controls in the player. | Playback regression e2e |

## Browser support notes

| Area | Status | Notes |
|------|--------|-------|
| Chromium desktop | Public Beta target | Primary Playwright coverage. |
| Mobile browser viewport | Experimental | Usable with known CPU/memory limits; large lyrics/stems/packages can require scrolling. |
| IndexedDB/localStorage library | Experimental | Browser-local only. Clearing site data removes saved items. |
| FFmpeg WASM | Experimental dependency | Required for some source formats; large first-load asset. WAV and existing MP5 flows avoid many FFmpeg paths. |
| Large embedded packages | Experimental | Browser memory/storage limits apply; CLI validation is preferred for very large packages. |

## Explicit non-goals

- Production archival/legal ingestion.
- Claiming MP5 beats MP3, AAC, Opus, or FLAC.
- DRM, rights enforcement, legal proof, or authenticity guarantee.
- No AI generation, no AI stem separation, No telemetry, no upload, and no cloud sync.
- Universal third-party ecosystem support.
