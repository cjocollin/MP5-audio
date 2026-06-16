# MP5 Limitations

**Version:** MP5 Audio v0.20.0-beta  
**Status:** Public Beta technical notes

MP5 is experimental and browser-based. It is not production-ready for archival, legal, rights, or untrusted ingestion workflows.

For the current public list, see [MP5_KNOWN_ISSUES.md](MP5_KNOWN_ISSUES.md). For the v0.20 release gate record, see [MP5_BETA_READINESS.md](MP5_BETA_READINESS.md).

## Format Status

- `.mp5` playback is centered on `HEAD` + `AUDI`.
- `.mp5p` album packages are experimental and can be memory-heavy.
- Unknown optional chunks are safe to skip, but the format is not standardized outside this project.
- MP5 performs no DRM enforcement, rights verification, legal proof, telemetry, upload, or cloud sync.

## Codec Limits

| Codec | Limitation |
|-------|------------|
| MP5-L v3 | Recommended lossless path, bit-exact, but not claimed to beat FLAC. Reference material remains around 0.95x PCM in existing benchmarks. |
| MP5-C | Lab-only; known hiss/artifact risk on music material; not for normal listening or distribution claims. |
| MP5-H | Experimental hybrid mode; correction layers can produce large files; not default. |
| PCM | Reference/debug fallback; large files. |

## Browser Limits

- WASM and FFmpeg cold loads are large.
- Long files, many stems, and large embedded `.mp5p` packages can stress memory and storage.
- Mobile viewports are supported by tests, but dense lyrics/stem/package views may still require scrolling.

## Metadata Limits

- Optional chunks are display/tooling metadata; playback must continue without them.
- Content guidance, mood/vibe, credits, rights, and identifiers are informational only.
- The reference converter does not generate lyrics, warnings, stems, or AI-enriched metadata.

## Security Model

The parser enforces file/chunk/value/package caps and avoids executing embedded content. Treat untrusted `.mp5` and `.mp5p` files as experimental inputs, not as hardened production media.
