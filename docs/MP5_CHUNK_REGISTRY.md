# MP5 Chunk Registry

**Version:** MP5 Audio v0.29.0-beta  
**Status:** Public Beta toolkit reference  
**Format magic:** `MP5A`  
**Required for playback:** `HEAD` and `AUDI`

This registry lists known MP5 chunks and the current reference-tool support level. It does not add new format semantics in v0.29.0-beta. Unknown optional chunks are skipped safely after size and CRC checks; required chunk failures fail closed.

Status key: **yes** = supported in the reference code; **partial** = supported for the documented subset; **skip** = parser stores or ignores without semantic decode; **registry** = reserved/recognized name only; **n/a** = not applicable.

## Container Limits

| Limit | Public Beta value | Source |
|-------|-------------------|--------|
| Max `.mp5` file size | 2 GiB | `MAX_FILE_SIZE` |
| Max chunks per `.mp5` | 256 | `MAX_CHUNKS` |
| Max chunk payload | 64 MiB | `MAX_CHUNK_PAYLOAD` |
| Max `META` value | 8 KiB | `MAX_META_VALUE` |
| Required chunks | `HEAD`, `AUDI` | `REQUIRED_CHUNKS` |
| CRC flag | bit 0 (`CHUNK_FLAG_CRC`) | container header |

## Album Package Limits

| Limit | Public Beta value | Source |
|-------|-------------------|--------|
| Manifest track count | 256 tracks | `MAX_ALBUM_TRACKS` |
| Manifest JSON size | 8 MiB | `MAX_ALBUM_MANIFEST_JSON_BYTES` |
| Embedded fragment payload | 16 MiB max, 12 MiB default | `EMBEDDED_MAX_FRAGMENT_PAYLOAD` |
| Embedded directory size | 16 MiB | `EMBEDDED_MAX_DIRECTORY_BYTES` |
| Embedded track id length | 128 chars | `EMBEDDED_MAX_TRACK_ID_LEN` |
| Embedded logical filename length | 512 chars | `EMBEDDED_MAX_LOGICAL_FILE_LEN` |

## Core Chunks

| FourCC | Purpose | Ver | Required | Payload | Max | Safe ignore | Parser | Writer | Converter | Player | Tests | Docs |
|--------|---------|-----|----------|---------|-----|-------------|--------|--------|-----------|--------|-------|------|
| `HEAD` | Codec, channels, rate, duration | 1 | yes | binary | fixed 32 bytes | no | yes | yes | yes | yes | yes | [Format](MP5_FORMAT_SPEC.md) |
| `AUDI` | Audio frames | 1 | yes | binary | chunk limit | no | yes | yes | yes | yes | yes | [Codec](MP5_CODEC_SPEC.md) |
| `META` | Key/value metadata | 1 | no | UTF-8 KV | chunk limit; 8 KiB/value | yes | yes | yes | yes | yes | yes | [Metadata](MP5_METADATA_SPEC.md) |
| `COVR` | Cover art bytes and mime | 1 | no | binary | app limit 2 MiB | yes | yes | yes | yes | yes | yes | [Metadata](MP5_METADATA_SPEC.md) |
| `SEEK` | Seek table | 1 | no | binary | chunk limit | yes | yes | yes | yes | yes | yes | [Format](MP5_FORMAT_SPEC.md) |
| `WAVE` | Waveform preview peaks | 1 | no | float32 array | chunk limit | yes | yes | yes | yes | yes | yes | [Format](MP5_FORMAT_SPEC.md) |
| `INFO` | Encoder/tool metadata | 1 | no | UTF-8 KV | chunk limit | yes | yes | yes | yes | yes | yes | [Format](MP5_FORMAT_SPEC.md) |
| `CORR` | MP5-H correction layer | 1 | no | binary | chunk limit | conditional | yes | yes | MP5-H only | partial | yes | [MP5-H](MP5H.md) |

`CORR` is optional for container parsing but required for clean MP5-H reconstruction.

## Content Guidance Chunks

| FourCC | Purpose | Ver | Required | Payload | Max | Safe ignore | Parser | Writer | Converter | Player | Tests | Docs |
|--------|---------|-----|----------|---------|-----|-------------|--------|--------|-----------|--------|-------|------|
| `EXPL` | Explicit/content notices | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Content warnings](MP5_CONTENT_WARNINGS.md) |
| `SAFE` | Sensitive/emotional themes | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Content warnings](MP5_CONTENT_WARNINGS.md) |
| `RECV` | Recovery-oriented profile flags | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | partial | [Metadata](MP5_METADATA_SPEC.md) |
| `SENS` | Listener comfort / sensory notes | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Content warnings](MP5_CONTENT_WARNINGS.md) |

## Optional Metadata And Playback Enrichment

These chunks are optional. They are manually provided or fixture-generated in the reference app; v0.29.0-beta does not add AI generation.

| FourCC | Purpose | Ver | Required | Payload | Max | Safe ignore | Parser | Writer | Converter | Player | Tests | Docs |
|--------|---------|-----|----------|---------|-----|-------------|--------|--------|-----------|--------|-------|------|
| `MOOD` | Mood tags | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Metadata](MP5_METADATA_SPEC.md) |
| `VIBE` | Vibe/energy/use-case tags | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Metadata](MP5_METADATA_SPEC.md) |
| `LYRC` | Unsynced/synced lyrics | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Metadata](MP5_METADATA_SPEC.md) |
| `STEM` | Stem manifest | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Stems](MP5_STEMS.md) |
| `STDA` | Small stem audio payload | 1 | no | binary | chunk limit | yes | yes | yes | yes | partial | yes | [Stems](MP5_STEMS.md) |
| `STDF` | Segmented stem data fragments | 1 | no | binary | chunk limit per fragment | yes | yes | yes | yes | partial | yes | [Stems](MP5_STEMS.md) |
| `SECT` | Song sections | 1 | no | JSON | chunk limit | yes | yes | yes | no | yes | yes | [Sections](MP5_SECTIONS.md) |
| `HOOK` | Hook window | 1 | no | JSON | chunk limit | yes | yes | demo | no | yes | yes | [Sections](MP5_SECTIONS.md) |
| `HILT` | Highlight moments | 1 | no | JSON | chunk limit | yes | yes | demo | no | yes | yes | [Sections](MP5_SECTIONS.md) |
| `VISU` | Visual theme metadata | 1 | no | JSON | chunk limit | yes | yes | yes | no | yes | yes | [Visual themes](MP5_VISUAL_THEMES.md) |
| `FING` | Fingerprint/library identity | 1 | no | JSON | chunk limit | yes | yes | yes | no | yes | yes | [Integrity](MP5_FINGERPRINT_INTEGRITY.md) |
| `HASH` | SHA-256 integrity metadata | 1 | no | JSON | chunk limit | yes | yes | yes | no | yes | yes | [Integrity](MP5_FINGERPRINT_INTEGRITY.md) |
| `CRDT` | Credits | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Credits/rights](MP5_CREDITS_RIGHTS.md) |
| `LICN` | License/rights notes | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Credits/rights](MP5_CREDITS_RIGHTS.md) |
| `IDEN` | Release identifiers | 1 | no | JSON | chunk limit | yes | yes | yes | yes | yes | yes | [Credits/rights](MP5_CREDITS_RIGHTS.md) |
| `ALBM` | In-file album manifest JSON | 1 | no | JSON | chunk limit | yes | yes | partial | partial | partial | partial | [Album package](MP5_ALBUM_PACKAGE.md) |

## Registry-Only Optional Chunks

These names are reserved for forward-compatible storage. The reference parser can skip or store them, but there is no Public Beta semantic decoder.

| FourCC | Purpose | Ver | Required | Payload | Safe ignore | Parser | Writer | Converter | Player | Tests | Docs |
|--------|---------|-----|----------|---------|-------------|--------|--------|-----------|--------|-------|------|
| `BEAT` | Beat grid | 1 | no | JSON | yes | skip | registry | no | no | no | [Metadata](AI_METADATA_SPEC.md) |
| `SUMM` | Summary text | 1 | no | JSON | yes | skip | registry | no | no | no | [Metadata](AI_METADATA_SPEC.md) |
| `RECS` | Recommendation hints | 1 | no | JSON | yes | skip | registry | no | no | no | [Metadata](AI_METADATA_SPEC.md) |
| `LAYS` | Layer layout | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `MIXR` | Mix recipe | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `KARA` | Karaoke map | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `SOLO` | Solo/mute hints | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `CVRA` | Alternate covers | 1 | no | JSON/binary | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `ARTS` | Artist assets | 1 | no | JSON/binary | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `SHAR` | Share metadata | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `CLIP` | Clip markers | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `NOTE` | Private notes | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `MEMR` | Private memories | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `ACCS` | Accessibility profile | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `QUAL` | Quality metrics | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `REPR` | Representation map | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `AIPR` | Provenance flags | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `VERS` | Version hints | 1 | no | JSON | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |
| `SIGN` | Signature metadata | 1 | no | JSON/binary | yes | skip | registry | no | no | no | [Advanced](MP5_ADVANCED_FEATURES.md) |

## Moonshot Reserved Chunks

These chunks are spec-only reservations. They must never be required for playback.

| FourCC | Purpose | Ver | Required | Payload | Safe ignore | Parser | Writer | Converter | Player | Tests | Docs |
|--------|---------|-----|----------|---------|-------------|--------|--------|-----------|--------|-------|------|
| `ADPT` | Adaptive audio | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `BRCH` | Branching audio | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `RESP` | Responsive rules | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `EXPR` | Expressive performance data | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `COMM` | Community annotations | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `RULS` | Rule metadata | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `HEAL` | Recovery/wellness experiments | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `TIME` | Time/private listening data | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `CLEAN` | Clean alternate map | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `LIVE` | Live session data | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `LANG` | Language localization | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `MAST` | Mastering variants | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `DNA_` | Audio DNA experiment | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `SAMP` | Sample map | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |
| `AIRG` | Air-gap / external context | 1 | no | reserved | yes | skip | registry | no | no | no | [Moonshot](MP5_MOONSHOT_FEATURES.md) |

## Unknown Chunks

Any unknown FourCC is treated as optional unless it is one of the required chunks. The parser reads the size, enforces limits, verifies CRC when flagged, and then stores or skips it. Test coverage includes `FUTR` in `test-fixtures/compatibility/mp5l_unknown_futr.mp5`.

## Album Package Formats

Album packages are not MP5 chunks. They are `.mp5p` files handled by the package tooling.

| Format | Purpose | Version | Validation | Docs |
|--------|---------|---------|------------|------|
| Manifest `.mp5p` | JSON manifest plus sidecar `.mp5` tracks | `mp5-album-manifest-v1` | `pnpm validate:mp5p <file> --dir <sidecars> --profile package` | [Album package](MP5_ALBUM_PACKAGE.md) |
| Embedded `.mp5p` | Self-contained binary package with fragments | `mp5-album-embedded-v1` / `MP5P` | `pnpm validate:mp5p <file> --profile package` | [Embedded package](MP5_EMBEDDED_PACKAGE.md) |

## Tooling Cross-Reference

| Tool | Registry use |
|------|--------------|
| `pnpm inspect:mp5 <file>` | Prints chunk, profile, integrity, lyrics, stem, VISU, and package summaries |
| `pnpm validate:mp5 <file> --profile playable` | Validates `.mp5` profile expectations |
| `pnpm validate:mp5p <file> --profile package` | Validates manifest or embedded `.mp5p` package structure |
| `pnpm test:compat` | Verifies golden synthetic compatibility fixtures |
| Player Format panel | Shows compatibility level and codec/profile labels |
