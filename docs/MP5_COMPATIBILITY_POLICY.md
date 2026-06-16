# MP5 Compatibility Policy

**Version:** MP5 Audio v0.20.0-beta  
**Scope:** container, chunks, codecs, packages, and toolkit profiles

MP5 is an experimental Public Beta. This policy defines how the reference parser, writer, player, and validation tools treat current files while preserving honest forward compatibility.

## Playback Baseline

| Item | Policy |
|------|--------|
| Required chunks | `HEAD` and `AUDI` |
| Optional chunks | Must not be required for playback |
| Unknown optional chunks | Skip safely after size/CRC checks |
| Required CRC failure | Fail closed |
| Optional CRC failure | Drop/skip optional chunk and continue when possible |
| Codec default | MP5-L v3 |
| Package default | Single `.mp5`; `.mp5p` remains experimental |

## Codec Roles

| Codec | Role |
|-------|------|
| MP5-L v3 | Default/recommended lossless path |
| MP5-C | Lab-only; may hiss; not a distribution default |
| MP5-H | Experimental hybrid; large; not default |
| PCM | Reference/debug fallback |

## Validation Profiles

| Profile | Meaning |
|---------|---------|
| `basic` | Container parses and required structure is sane |
| `playable` | `HEAD` + `AUDI` present and playable by the reference stack |
| `rich` | Playable plus implemented optional metadata is structurally valid |
| `strict` | Rich plus supported integrity metadata verifies |
| `package` | `.mp5p` manifest or embedded package structure validates |

Profiles are compatibility hints, not legal, rights, or archival certification.

## Public Claims

Allowed: Public Beta, experimental, browser-based, MP5-L v3 recommended, MP5-C lab-only, MP5-H large/experimental, `.mp5p` experimental.

Not allowed: production-ready, beats MP3/AAC/Opus/FLAC, DRM enforcement, legal proof, AI stem separation, telemetry/upload/cloud-sync claims.

## Related Docs

- [Compatibility matrix](MP5_COMPATIBILITY_MATRIX.md)
- [Chunk registry](MP5_CHUNK_REGISTRY.md)
- [Developer quickstart](MP5_DEVELOPER_QUICKSTART.md)
