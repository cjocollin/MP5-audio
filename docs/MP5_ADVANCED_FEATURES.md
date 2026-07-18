# MP5 Advanced Features

**Version:** MP5 Audio v0.26.0-beta  
**Status:** Optional / experimental registry

Advanced chunks are optional. They are never required for playback, and v0.26.0-beta does not add new advanced semantics.

## Stems

Implemented stem support uses:

- `STEM` for the manifest.
- `STDA` for small single-chunk stem payloads.
- `STDF` for fragmented large stem payloads.

Stems are user/artist-provided through the converter. There is no AI stem separation. Full-mix playback remains in `AUDI`, and the player falls back to `AUDI` when stems are missing or too heavy for the device.

See [MP5_STEMS.md](MP5_STEMS.md).

## Registry-Only Advanced Chunks

The following names are reserved or documented for forward-compatible storage but do not have Public Beta semantic decoders:

`LAYS`, `MIXR`, `KARA`, `SOLO`, `CVRA`, `ARTS`, `SHAR`, `CLIP`, `NOTE`, `MEMR`, `ACCS`, `QUAL`, `REPR`, `AIPR`, `VERS`, `SIGN`

Parsers must skip them safely. Apps may choose to display raw presence, but must not require them for playback.

## Implemented Optional Advanced Metadata

| FourCC | Purpose | Docs |
|--------|---------|------|
| `CRDT` | Credits | [Credits/rights](MP5_CREDITS_RIGHTS.md) |
| `LICN` | License/rights notes | [Credits/rights](MP5_CREDITS_RIGHTS.md) |
| `IDEN` | Release identifiers | [Credits/rights](MP5_CREDITS_RIGHTS.md) |
| `HASH` | Integrity metadata | [Fingerprint/integrity](MP5_FINGERPRINT_INTEGRITY.md) |
| `ALBM` | In-file album manifest metadata | [Album package](MP5_ALBUM_PACKAGE.md) |
