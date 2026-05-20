# MP5 Container Specification (v0.1)

## File envelope

| Offset | Size | Field |
|--------|------|-------|
| 0 | 4 | Magic `MP5A` |
| 4 | 1 | Major version (`1`) |
| 5 | 3 | Reserved (0) |
| 8 | 4 | File flags (u32 LE) |

Followed by chunk stream until EOF.

## Chunk header (16 bytes, LE)

| Offset | Field | Type |
|--------|-------|------|
| 0 | fourcc | char[4] |
| 4 | payload_size | u32 |
| 8 | flags | u16 |
| 10 | reserved | u16 (0) |
| 12 | crc32 | u32 |

**flags** bit 0: CRC present (CRC32-IEEE over payload).

**Limits:** max payload 64 MiB; max 256 chunks; max file 2 GiB.

## HEAD payload (32 bytes)

| Offset | Field | Type |
|--------|------|------|
| 0 | codec_id | u8 |
| 1 | channels | u8 |
| 2 | bits_per_sample | u8 |
| 3 | preset_id | u8 |
| 4 | sample_rate | u32 |
| 8 | total_samples | u64 |
| 16 | encoder_version | u16 |
| 18 | reserved | u14 |

## AUDI payload

Sequence of frames:

| Field | Type |
|-------|------|
| frame_index | u32 |
| byte_length | u32 |
| block_type | u8 |
| flags | u8 |
| data | byte[byte_length] |

## META payload

Repeated: `key_len u16`, `key utf8`, `val_len u16`, `val utf8`. Max 8 KiB per value.

## SEEK payload

Repeated: `sample_offset u64`, `byte_offset u64` (monotonic).

## WAVE payload

`point_count u32`, then `point_count` × `peak f32` (0..1).

## Security

- Reject bad magic/version
- Cap sizes; no unbounded reads
- Sanitize UTF-8 metadata for UI
- Required chunk CRC failures fail closed; optional chunks may be skipped
