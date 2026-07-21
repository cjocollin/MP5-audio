# MP5 Stems

**Version:** MP5 Audio v0.28.0-beta  
**Status:** Optional experimental metadata/audio enrichment

Stems are optional. Every `.mp5` file must remain playable from the `AUDI` full-mix chunk alone. Players that do not implement stems can ignore `STEM`, `STDA`, and `STDF`.

v0.28.0-beta does not change STDF/STDA semantics, playback transport, codec policy, or converter encoding behavior.

## Policy

- No AI stem separation in the reference app.
- Users/artists provide stem files manually through the converter.
- Full mix remains required in `AUDI`.
- Stems encode as MP5-L v3 when WASM is available, with PCM reference fallback where needed.
- Stem mixing is opt-in and device/browser-memory dependent.

## Chunks

| FourCC | Role | Required |
|--------|------|----------|
| `AUDI` | Full mix and default playback path | yes |
| `STEM` | JSON manifest with per-stem metadata | no |
| `STDA` | Small single-chunk stem audio payloads | no |
| `STDF` | Segmented stem fragments for larger stem sets | no |

## STEM Manifest

Each stem entry includes:

| Field | Description |
|-------|-------------|
| `stemId` | Stable identifier |
| `stemName` | Display name |
| `stemType` | Taxonomy label |
| `codecId` | MP5-L or PCM for the stem frame |
| `sampleRate` | Hz |
| `channels` | Channel count |
| `durationSamples` | Samples per channel |
| `byteLength` | Payload size |
| `checksum` | CRC32 hex of frame data |
| `defaultVolume` | Default gain |
| `soloMuteCapable` | UI may offer mute/solo |
| `requiredForPlayback` | Defaults false; stems never block AUDI playback |
| `dataOffset` / `dataLength` | Logical range in stem frame data |
| `fragmentCount` | STDF fragment count |

Recommended `stemType` values:

`full_mix`, `lead_vocals`, `background_vocals`, `drums`, `bass`, `guitar`, `piano`, `synths`, `strings`, `percussion`, `instrumental`, `acapella`, `effects`, `custom`

## STDA Layout

`STDA` (`stda-v1`) stores small stem sets in one chunk:

```text
u8 version (=1)
u8 stem_count
repeat stem_count:
  u32 frame_length
  u8[frame_length]
```

## STDF Layout

`STDF` (`stdf-v1`) stores large stem sets as fragments under the 64 MiB chunk cap:

```text
u8 version (=1)
u8 stem_id_length
u8[stem_id_length] stem_id (UTF-8)
u16 part_index
u16 part_count
u32 payload_length
u32 payload_crc32
u8[payload_length]
```

The `STEM` manifest records `storageMode: "stdf-v1"` and per-stem `fragmentCount`.

## Converter

1. Export the full mix as normal MP5-L v3.
2. Optionally import stem files (WAV, FLAC, MP3, M4A, OGG through the converter decode path).
3. Validate sample rate, channels, and duration against the full mix.
4. Offer normalization for rate/channel/duration mismatches.
5. Export `STEM` plus `STDA` for small sets or `STEM` plus `STDF` fragments for large sets.

Normalization is a rate/channel/duration helper only. It is not AI alignment or stem generation.

## Player

- Default playback is always `AUDI`.
- Stem mix, solo, and karaoke are opt-in.
- Large stems are prepared lazily and may use background workers.
- If stem preparation fails or is too heavy, full-mix playback still works.

## Fixture

`test-fixtures/demo_mp5l_v3_stems.mp5` is synthetic and includes a full mix plus drums, bass, and lead vocal stems.

Validation:

```bash
node scripts/validate-stem-fixture.mjs
pnpm inspect:mp5 test-fixtures/demo_mp5l_v3_stems.mp5
```

## Limits

| Guard | Value |
|-------|-------|
| Max stems in manifest | 32 |
| Container chunk cap | 64 MiB |
| Warn selected decode RAM | about 96 MiB |
| Block selected decode RAM | about 384 MiB |
| Block single stem decode | about 128 MiB |

See also [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md), [MP5_ADVANCED_FEATURES.md](MP5_ADVANCED_FEATURES.md), and [MP5_PLAYBACK_REGRESSION_CHECKLIST.md](MP5_PLAYBACK_REGRESSION_CHECKLIST.md).
