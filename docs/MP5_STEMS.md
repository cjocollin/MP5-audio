# MP5 Stems

**Version:** MP5 Audio v0.28.0-beta  
**Status:** Optional experimental metadata/audio enrichment

Stems are optional. Every `.mp5` file must remain playable from the `AUDI` full-mix chunk alone. Players that do not implement stems can ignore `STEM`, `STDA`, and `STDF`.

STDA/STDF byte layout is unchanged. Stem manifests may declare `codingMode: "alias"` to omit duplicate payload bytes (see below). Converter stem encode uses MP5-L v4 when WASM is available.

## Policy

- No AI stem separation in the reference app.
- Users/artists provide stem files manually through the converter.
- Full mix remains required in `AUDI`.
- Unique stems encode as MP5-L v4 when WASM is available, with PCM reference fallback where needed.
- When a stem’s Int16 PCM is bit-exact identical to the AUDI mix, the exporter **omits duplicate stem data** (`codingMode: "alias"`, `refTarget: "AUDI"`). That is deduplication, not a better entropy coder.
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
| `dataOffset` / `dataLength` | Logical range in stem frame data (`0` for alias stems) |
| `fragmentCount` | STDF fragment count (omit / unused for alias stems) |
| `codingMode` | Optional. Omit or `independent` = encoded frame in STDA/STDF. `alias` = no payload; reuse referent PCM |
| `refTarget` | Required when `codingMode` is `alias`. v1 supports `"AUDI"` only |

Unknown `codingMode` values: stem audio is unavailable; AUDI still plays.

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

The `STEM` manifest records `storageMode: "stda-v1"` or `"stdf-v1"` and per-stem `fragmentCount` for payload stems. Alias stems are listed in `STEM` for UI but contribute no STDA/STDF bytes. If every stem is an alias, `STDA`/`STDF` may be absent.

## Converter

1. Export the full mix as MP5-L (product default; demo packer uses v4).
2. Optionally import stem files (WAV, FLAC, MP3, M4A, OGG through the converter decode path).
3. Validate sample rate, channels, and duration against the full mix.
4. Offer normalization for rate/channel/duration mismatches.
5. For each stem: if PCM equals AUDI bit-exact → alias entry; else encode MP5-L v4.
6. Export `STEM` plus `STDA` for small payload sets or `STEM` plus `STDF` fragments for large sets.

Normalization is a rate/channel/duration helper only. It is not AI alignment or stem generation.

## Player

- Default playback is always `AUDI`.
- Stem mix, solo, and karaoke are opt-in.
- Alias stems resolve to the already-decoded AUDI PCM (no extra stem download/decode).
- Large independent stems are prepared lazily and may use background workers.
- If stem preparation fails or is too heavy, full-mix playback still works.

## Pack size (karaoke demos)

Measured after alias + MP5-L v4 stems (`scripts/pack-stem-song-mp5.mjs`), bit-exact vs source FLAC PCM:

| File | Before | After | Notes |
|------|-------:|------:|-------|
| Takedown.mp5 | ~100.0 MB | ~70.1 MB | Sing-Along → AUDI alias; Instrumental/Acapella v4 |
| Your Idol.mp5 | ~105.9 MB | ~73.6 MB | Same pattern |

Most of the cut is omitting the Sing-Along duplicate of the mix; v4 on the remaining stems adds a smaller further reduction.

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
