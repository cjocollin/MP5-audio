# MP5 Limitations

**Version:** MP5 Audio v0.29.0-beta  
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
| MP5-L v3 | Recommended lossless path, bit-exact (verified across the Audio Quality Lab fixtures), but not claimed to beat FLAC. Reference material remains around 0.95x PCM in existing benchmarks. |
| MP5-C | Lab-only; quiet-passage hiss is now measured (quiet-window SNR ~2.6–5.7 dB on decaying material even where full-song SNR looks fine); not for normal listening or distribution claims. |
| MP5-C vNext (MP5C2) | Lab/advanced hybrid (CodecId 5, AUDI `0x43 0x34`); Converter gated; batch stays MP5-L. Quiet→lossless, loud→MP5-C. Not the default. |
| MP5-H | Experimental hybrid mode; correction layers can produce large files (averages >1× PCM); not default. |
| PCM | Reference/debug fallback; large files. |

For lab methodology and how to reproduce these numbers, see [MP5_AUDIO_QUALITY_LAB.md](MP5_AUDIO_QUALITY_LAB.md) and [MP5_CODEC_STATUS.md](MP5_CODEC_STATUS.md). Full-song SNR alone is misleading; quiet-window SNR and silence residual are the honest measures.

## Browser Limits

- WASM and FFmpeg cold loads are large.
- Long files, many stems, and large embedded `.mp5p` packages can stress memory and storage.
- Mobile viewports are supported by tests, but dense lyrics/stem/package views may still require scrolling.

## Metadata Limits

- Optional chunks are display/tooling metadata; playback must continue without them.
- Content guidance, mood/vibe, credits, rights, and identifiers are informational only.
- The reference converter does not generate lyrics, warnings, or stems automatically.
- **Opt-in AI metadata suggestions** (Settings → enable, optional BYOK API key): local BPM estimate plus optional cloud features — BPM/key (audio), song structure (SECT), lyrics (LYRC), content warnings (EXPL/SAFE), mood/vibe/summary. All suggestions require user review before export; provenance is stored in chunk `source` fields (`ai-local`, `ai-cloud`, `user`). Cloud lyrics transcribe audio verbatim (Gemini/OpenAI only); text-only providers are rejected because they tend to invent lyrics from song title/artist.
- **No AI stem separation.**

## Security Model

The parser enforces file/chunk/value/package caps and avoids executing embedded content. Treat untrusted `.mp5` and `.mp5p` files as experimental inputs, not as hardened production media.
