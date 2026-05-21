# MP5 chunk registry (canonical — Alpha v0.9.0)

Single reference for all known MP5 container chunks. Policy: [`MP5_COMPATIBILITY_POLICY.md`](MP5_COMPATIBILITY_POLICY.md). Feature coverage: [`MP5_FEATURE_MATRIX.md`](MP5_FEATURE_MATRIX.md).

**File magic:** `MP5A` · **Required for playback:** `HEAD`, `AUDI` only

Column key: **Req** = required for playback · **Parser** / **Writer** / **Converter** / **Player** = support level (✅ / — / registry / skip)

---

## Core chunks

| FourCC | Purpose | Req | Ver | Payload | Max size | Safe ignore | Parser | Writer | Converter | Player | Tests | Docs |
|--------|---------|:---:|:---:|---------|----------|-------------|:------:|:------:|:---------:|:------:|:-----:|------|
| **HEAD** | Codec, sample rate, channels, bit depth, duration | ✅ | 1 | Binary | chunk limit | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_FORMAT_SPEC.md](MP5_FORMAT_SPEC.md) |
| **AUDI** | Audio frames (MP5-L/C/H or PCM) | ✅ | 1 | Binary frames | chunk limit | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_CODEC_SPEC.md](MP5_CODEC_SPEC.md) |
| **META** | Key/value tags (title, artist, …) | — | 1 | UTF-8 KV | chunk limit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| **COVR** | Cover art bytes + mime | — | 1 | Binary | 2 MiB app limit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| **SEEK** | Seek table (sample → byte) | — | 1 | Binary | chunk limit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_FORMAT_SPEC.md](MP5_FORMAT_SPEC.md) |
| **WAVE** | Waveform preview peaks | — | 1 | Float32[] | chunk limit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_FORMAT_SPEC.md](MP5_FORMAT_SPEC.md) |
| **INFO** | Encoder / tooling metadata | — | 1 | UTF-8 KV | chunk limit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_FORMAT_SPEC.md](MP5_FORMAT_SPEC.md) |
| **CORR** | MP5-H lossless correction | — | 1 | Binary | chunk limit | ✅* | ✅ | ✅ | MP5-H only | ✅ | ✅ | [MP5H.md](MP5H.md) |

\*Required for **clean** MP5-H playback; optional for container parse.

---

## Content guidance (warning tier)

| FourCC | Purpose | Ver | Payload | Safe ignore | Parser | Writer | Converter | Player | Tests | Docs |
|--------|---------|:---:|---------|-------------|:------:|:------:|:---------:|:------:|:-----:|------|
| **EXPL** | Content explanation / notices | 1 | JSON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_CONTENT_WARNINGS.md](MP5_CONTENT_WARNINGS.md) |
| **SAFE** | Listener comfort / safety | 1 | JSON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_CONTENT_WARNINGS.md](MP5_CONTENT_WARNINGS.md) |
| **RECV** | Recovery-oriented flags | 1 | JSON | ✅ | ✅ | ✅ | ✅ | ✅ | partial | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| **SENS** | Sensitive themes | 1 | JSON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_CONTENT_WARNINGS.md](MP5_CONTENT_WARNINGS.md) |

---

## AI / feature tier (implemented decoders)

| FourCC | Purpose | Ver | Payload | Safe ignore | Parser | Writer | Converter | Player | Tests | Docs |
|--------|---------|:---:|---------|-------------|:------:|:------:|:---------:|:------:|:-----:|------|
| **MOOD** | Mood tags | 1 | JSON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| **VIBE** | Vibe / energy | 1 | JSON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| **LYRC** | Lyrics (synced + unsynced) | 1 | JSON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| **STEM** | Stem manifest | 1 | JSON | ✅ | ✅ | ✅ | ✅ optional | ✅ | ✅ | [MP5_STEMS.md](MP5_STEMS.md) |
| **STDA** | Stem audio (single chunk, small sets) | 1 | Binary | ✅ | ✅ | ✅ | ✅ optional | ✅ mix | ✅ | [MP5_STEMS.md](MP5_STEMS.md) |
| **STDF** | Stem data fragments (large sets) | 1 | Binary | ✅ | ✅ | ✅ auto | ✅ optional | ✅ mix | ✅ | [MP5_STEMS.md](MP5_STEMS.md) |
| **SECT** | Song sections / structure | 1 | JSON | ✅ | ✅ | ✅ | — | ✅ | ✅ | [MP5_SECTIONS.md](MP5_SECTIONS.md) |
| **HOOK** | Hook window (one) | 1 | JSON | ✅ | ✅ | demo | — | ✅ | ✅ | [MP5_SECTIONS.md](MP5_SECTIONS.md) |
| **HILT** | Highlight moments | 1 | JSON | ✅ | ✅ | demo | — | ✅ | ✅ | [MP5_SECTIONS.md](MP5_SECTIONS.md) |
| **VISU** | Visual theme | 1 | JSON | ✅ | ✅ | ✅ | — | ✅ | ✅ | [MP5_VISUAL_THEMES.md](MP5_VISUAL_THEMES.md) |
| **FING** | Audio fingerprint | 1 | JSON | ✅ | ✅ | ✅ | — | ✅ | ✅ | [MP5_FINGERPRINT_INTEGRITY.md](MP5_FINGERPRINT_INTEGRITY.md) |

### AI tier (registry only — no decoder yet)

| FourCC | Purpose | Safe ignore | Notes |
|--------|---------|-------------|-------|
| **BEAT** | Beat grid | ✅ | Stored in optional map |
| **SUMM** | Summary | ✅ | Planned |
| **RECS** | Recommendations | ✅ | Planned |

---

## Advanced tier

| FourCC | Purpose | Ver | Decoder | Safe ignore | Tests | Docs |
|--------|---------|:---:|---------|-------------|:-----:|------|
| **CRDT** | Credits | 1 | ✅ | ✅ | ✅ | [MP5_CREDITS_RIGHTS.md](MP5_CREDITS_RIGHTS.md) |
| **LICN** | Rights (informational) | 1 | ✅ | ✅ | ✅ | [MP5_CREDITS_RIGHTS.md](MP5_CREDITS_RIGHTS.md) |
| **IDEN** | Release identifiers | 1 | ✅ | ✅ | ✅ | [MP5_CREDITS_RIGHTS.md](MP5_CREDITS_RIGHTS.md) |
| **HASH** | SHA-256 integrity | 1 | ✅ | ✅ | ✅ | [MP5_FINGERPRINT_INTEGRITY.md](MP5_FINGERPRINT_INTEGRITY.md) |
| **ALBM** | In-file album manifest JSON | 1 | ✅ | ✅ | partial | [MP5_ALBUM_PACKAGE.md](MP5_ALBUM_PACKAGE.md) |

### Advanced registry-only (forward-compatible storage)

`LAYS`, `MIXR`, `KARA`, `SOLO`, `CVRA`, `ARTS`, `SHAR`, `CLIP`, `NOTE`, `MEMR`, `ACCS`, `QUAL`, `REPR`, `AIPR`, `VERS`, `SIGN` — skip on CRC error; no Alpha decoder.

---

## Moonshot tier (skip-only)

`ADPT`, `BRCH`, `RESP`, `EXPR`, `COMM`, `RULS`, `HEAL`, `TIME`, `CLEAN`, `LIVE`, `LANG`, `MAST`, `DNA_`, `SAMP`, `AIRG` — reserved; safe to ignore; see [MP5_MOONSHOT_FEATURES.md](MP5_MOONSHOT_FEATURES.md).

---

## Unknown chunks

Any other FourCC → stored in `optional` map. Test chunk: **FUTR** (`test-fixtures/compatibility/mp5l_unknown_futr.mp5`).

---

## Album package (not a chunk)

| Format | Purpose | Version | Docs |
|--------|---------|:---:|------|
| `.mp5p` | Sidecar JSON manifest + `.mp5` tracks | `mp5-album-manifest-v1` | [MP5_ALBUM_PACKAGE.md](MP5_ALBUM_PACKAGE.md) |

Validate: `pnpm validate:mp5p demo_album_package.mp5p --dir test-fixtures`

---

## Tooling cross-reference

| Tool | Uses registry |
|------|----------------|
| `pnpm inspect:mp5` | Lists chunks, profiles, warnings |
| `pnpm validate:mp5` | basic / playable / rich / strict |
| `pnpm validate:mp5p` | package profile |
| `pnpm fixtures:validate` | Golden fixtures |
| Player Format panel | Compatibility level summary |
