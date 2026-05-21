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
- `fileHash` — SHA-256 of full `.mp5` file bytes
- `fileSize`, `durationMs`, `sampleRate`, `channels`
- `generatedBy`, `generatedAt`, `source` (`encoder` | `app` | `user` | `unknown`)

### HASH (integrity)

- `algorithm` — `sha256`
- `fileSha256` — whole file
- `chunks[]` — `{ fourcc, sha256, size? }` for HEAD, META, AUDI, COVR, optional chunks, etc.

## Converter (MP5-L v3)

On export, the web converter embeds FING + HASH when possible. Failures show a calm status note; export still completes.

## Player

**Integrity & fingerprint** panel shows:

- Present / missing
- Short hash previews
- Status: verified, mismatch, missing, partial
- Calm mismatch warning (playback continues)

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
