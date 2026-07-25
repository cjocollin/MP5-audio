# MP5 Container Specification

**Version:** MP5 Audio v0.29.0-beta  
**Status:** Public Beta reference spec

This document describes the current `.mp5` container envelope. v0.29.0-beta does not change binary container semantics.

## File Envelope

| Offset | Size | Field |
|--------|------|-------|
| 0 | 4 | Magic `MP5A` |
| 4 | 1 | Major version (`1`) |
| 5 | 3 | Reserved (`0`) |
| 8 | 4 | File flags (`u32` little-endian) |

The envelope is followed by a chunk stream until EOF.

## Chunk Header

Each chunk has a 16-byte little-endian header.

| Offset | Field | Type |
|--------|-------|------|
| 0 | `fourcc` | `char[4]` |
| 4 | `payload_size` | `u32` |
| 8 | `flags` | `u16` |
| 10 | `reserved` | `u16` (`0`) |
| 12 | `crc32` | `u32` |

`flags` bit 0 is the CRC-present flag. CRC uses CRC32-IEEE over the payload.

## Public Beta Limits

| Limit | Value |
|-------|-------|
| Max file size | 2 GiB |
| Max chunks | 256 |
| Max chunk payload | 64 MiB |
| Max `META` value | 8 KiB |

These values correspond to `MAX_FILE_SIZE`, `MAX_CHUNKS`, `MAX_CHUNK_PAYLOAD`, and `MAX_META_VALUE` in `packages/mp5-container/src/constants.ts`.

## `HEAD` Payload

The `HEAD` payload is 32 bytes.

| Offset | Field | Type |
|--------|-------|------|
| 0 | `codec_id` | `u8` |
| 1 | `channels` | `u8` |
| 2 | `bits_per_sample` | `u8` |
| 3 | `preset_id` | `u8` |
| 4 | `sample_rate` | `u32` |
| 8 | `total_samples` | `u64` |
| 16 | `encoder_version` | `u16` |
| 18 | reserved | 14 bytes |

## `AUDI` Payload

`AUDI` is a sequence of frames.

| Field | Type |
|-------|------|
| `frame_index` | `u32` |
| `byte_length` | `u32` |
| `block_type` | `u8` |
| `flags` | `u8` |
| `data` | `byte[byte_length]` |

The `data` bytes are a **codec-specific bitstream**. Interpreters must use `HEAD.codec_id`:

| CodecId | Typical `data` magic (first bytes) | Notes |
|---------|--------------------------------------|-------|
| MP5-L (2) | `0x4c` + version | See [MP5L.md](MP5L.md) |
| MP5-C (1) | `0x43` + `0x02`…`0x06` | Public MP5-C pack versions |
| MP5-C2 (5) | `0x43 0x34` | vNext hybrid; **not** a valid MP5-C stream |
| MP5-H (3) | wrapper `0x48` + base/CORR | See [MP5H.md](MP5H.md) |
| PCM (0) | raw i16 LE | Debug/reference |

Cross-decoding MP5-C ↔ MP5-C2 must fail closed (distinct magic).

## Common Optional Payloads

| Chunk | Payload |
|-------|---------|
| `META` | Repeated `key_len u16`, UTF-8 key, `val_len u16`, UTF-8 value |
| `SEEK` | Repeated `sample_offset u64`, `byte_offset u64` |
| `WAVE` | `point_count u32`, then `point_count` `peak f32` values in `0..1` |
| `COVR` | Cover-art bytes plus mime metadata |
| `INFO` | UTF-8 key/value tool metadata |

## Parser Behavior

- Reject bad magic or unsupported required structure.
- Enforce file, chunk, and value caps before allocation.
- Required chunk CRC failures fail closed.
- Optional chunk CRC failures may drop that optional chunk while preserving core playback.
- Unknown optional chunks are skipped or stored in the optional map.
- Metadata is informational and must be sanitized before UI rendering.

## Related Tooling

- `pnpm inspect:mp5 <file>`
- `pnpm validate:mp5 <file> --profile playable`
- `pnpm validate:mp5p <file> --profile package`
- [MP5_CHUNK_REGISTRY.md](MP5_CHUNK_REGISTRY.md)
- [MP5_COMPATIBILITY_MATRIX.md](MP5_COMPATIBILITY_MATRIX.md)
