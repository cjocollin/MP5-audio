# MP5 Format Specification

**Version:** MP5 Audio v0.25.0-beta  
**Status:** Public Beta reference spec

MP5 is an experimental open-source audio format ecosystem. The core `.mp5` file is a chunked container with audio plus optional metadata/enrichment chunks. Public Beta playback requires only `HEAD` and `AUDI`.

This document is descriptive of the current reference implementation. v0.25.0-beta does not change codec policy, playback transport, MP5/STDF/MP5P semantics, or converter encoding behavior.

## File Model

| Layer | Role |
|-------|------|
| `.mp5` container | `MP5A` magic plus chunk stream |
| `HEAD` | codec id, sample rate, channel count, duration |
| `AUDI` | MP5-L, MP5-C, MP5-H, or PCM audio frames |
| Optional chunks | metadata, cover art, seek/waveform, lyrics, stems, sections, VISU, integrity, credits, album metadata |
| `.mp5p` package | separate album package format; manifest JSON or embedded binary package |

## Codec IDs

| ID | Codec | Public Beta role |
|----|-------|------------------|
| 0 | PCM | Reference/debug fallback |
| 1 | MP5-C | Lab-only lossy research mode; may hiss |
| 2 | MP5-L | Recommended lossless mode; v3 is the default |
| 3 | MP5-H | Experimental hybrid mode; large; not default |
| 4 | External passthrough | Registry value; not a normal export target |
| 5 | MP5-C2 (vNext) | Lab/advanced hybrid (quiet→MP5-L, loud→MP5-C). AUDI payload magic `0x43 0x34`. Not default; gated in Converter |
| 255 | Private/experimental | Not a public interoperability target |

MP5-C public streams use AUDI payload magics `0x43 0x02`–`0x06`. **MP5-C2 vNext is a distinct stream** (`0x43 0x34`) and must not be decoded as MP5-C (and vice versa).

## Core Chunks

| FourCC | Required | Purpose |
|--------|----------|---------|
| `HEAD` | yes | Global audio header |
| `AUDI` | yes | Audio frames |
| `META` | no | Standard text metadata |
| `COVR` | no | Cover art |
| `SEEK` | no | Seek table |
| `WAVE` | no | Waveform preview |
| `INFO` | no | Encoder/tool info |
| `CORR` | no | MP5-H correction layer |

All other chunks are optional and safe to ignore if the parser can skip them within limits.

## Optional Metadata And Enrichment

The reference implementation understands optional chunks for lyrics (`LYRC`), stems (`STEM`, `STDA`, `STDF`), sections (`SECT`, `HOOK`, `HILT`), content guidance (`EXPL`, `SAFE`, `SENS`, `RECV`), visual themes (`VISU`), credits/rights (`CRDT`, `LICN`, `IDEN`), and integrity (`FING`, `HASH`). See the [chunk registry](MP5_CHUNK_REGISTRY.md) for the complete list.

Optional metadata is informational. It must not block playback, claim legal proof, enforce rights, or imply that MP5 beats MP3/AAC/Opus/FLAC.

## Forward Compatibility

Parsers should:

- Reject bad magic, unsupported required structure, impossible sizes, and required chunk CRC failures.
- Enforce the public caps in [MP5_CONTAINER_SPEC.md](MP5_CONTAINER_SPEC.md).
- Skip unknown optional chunks after validating declared length and CRC if present.
- Continue playback when optional metadata is missing or unsupported.

## Related Specs

- [Container spec](MP5_CONTAINER_SPEC.md)
- [Codec spec](MP5_CODEC_SPEC.md)
- [Metadata spec](MP5_METADATA_SPEC.md)
- [Stems](MP5_STEMS.md)
- [Album package](MP5_ALBUM_PACKAGE.md)
- [Embedded package](MP5_EMBEDDED_PACKAGE.md)
- [Compatibility matrix](MP5_COMPATIBILITY_MATRIX.md)
- [Developer quickstart](MP5_DEVELOPER_QUICKSTART.md)
