# MP5 fingerprint & integrity (MVP)

Optional **local technical** metadata for duplicate detection, corruption checks, and safer album sidecar references.

## Not

- DRM or playback enforcement
- Legal ownership or artist verification
- Blockchain or licensing automation
- Acoustic fingerprinting (Chromaprint, etc.) in this MVP

Players may ignore **FING** and **HASH** entirely. Playback never depends on them.

## Chunks

| FourCC | Role |
|--------|------|
| **FING** | Library / identity fingerprints (PCM, AUDI, file, duration, format) |
| **HASH** | Per-chunk SHA-256 integrity manifest |

### FING (identity)

- `version` — schema version (1)
- `audioFingerprintType` — `sha256-pcm`, `sha256-audi`, `sha256-file`, or `none`
- `audioFingerprint` — primary identity hex (usually PCM or AUDI hash)
- `pcmHash` — SHA-256 of decoded PCM bytes (Int16 interleaved)
- `audiHash` — SHA-256 of encoded AUDI chunk payload
- `metaHash` — SHA-256 of encoded META payload
- `fileHash` — SHA-256 of `.mp5` bytes **before** FING/HASH were embedded (informational)
- `fileSize`, `durationMs`, `sampleRate`, `channels`
- `generatedBy`, `generatedAt`, `source` (`encoder` | `app` | `user` | `unknown`)

### HASH (integrity)

- `algorithm` — `sha256`
- `fileSha256` — same pre-embed whole-file hash as FING `fileHash` (informational in-file)
- `chunks[]` — `{ fourcc, sha256, size? }` for HEAD, META, AUDI, COVR, optional chunks, etc.

## Primary vs informational checks

| Check | Role |
|-------|------|
| **AUDI hash** | Primary encoded audio payload integrity |
| **PCM hash** | Primary decoded audio integrity (when PCM is available to verify) |
| **Per-chunk hashes** (HEAD, META, COVR, …) | Strict chunk-level checks; mismatch is a real warning |
| **Whole-file `fileSha256` / `fileHash`** | **Informational** when stored inside the same file |

### Why whole-file hash mismatches are common

The web converter computes `fileHash` / `fileSha256` over the container **before** appending FING and HASH. After those chunks are written, the on-disk file bytes change, so hashing the **final** file almost always disagrees with the embedded value. That is expected — not corruption.

**Status `audio_verified`** means AUDI (and PCM when checked) match; whole-file hash may show as informational only. The player does **not** show “file may be corrupted” in that case.

For strict verification of a whole file, store the hash **externally** (e.g. album manifest sidecar `fileSha256`) or use a canonicalized digest that excludes/zeroes the HASH chunk.

## Converter (MP5-L v3)

On export, the web converter embeds FING + HASH when possible. `fileHash` is computed on pre-embed bytes. Failures show a calm status note; export still completes.

## Player

**Integrity & fingerprint** panel shows:

- Present / missing
- Short hash previews (PCM, AUDI, File)
- Status: **verified**, **audio verified**, **integrity pending** (large files until idle verify), mismatch, missing, partial
- File hash row may show **informational** when only the pre-embed whole-file hash differs
- Mismatch warning only for real audio or chunk hash failures
- Large lazy-indexed files verify AUDI/PCM after decode without reading the whole file into memory

## CLI

- `pnpm inspect:mp5` — runs full verify; prints PCM/AUDI match and file hash informational note
- `pnpm validate:mp5 --profile strict` — passes when status is `verified` or `audio_verified`; fails on AUDI/PCM/chunk mismatch

## Local library duplicates

When saving to the library:

1. Match **fingerprint key** (PCM → AUDI → file hash) if present
2. Else match **filename + byte size**

User is warned and can skip saving a duplicate.

## Album packages (`.mp5p`)

Track entries may include optional `fileSha256` (64-char hex). On import:

| Status | Meaning |
|--------|---------|
| Verified | Sidecar found and hash matches |
| Hash mismatch | Sidecar found but bytes differ |
| No hash | Sidecar found, manifest has no expected hash |
| Missing | Referenced file not loaded |

Import never fails solely because hashes are missing or mismatched.

## See also

- [MP5_METADATA_SPEC.md](./MP5_METADATA_SPEC.md)
- [MP5_ALBUM_PACKAGE.md](./MP5_ALBUM_PACKAGE.md)
