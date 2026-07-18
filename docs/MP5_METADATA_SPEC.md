# MP5 Metadata Specification

**Version:** MP5 Audio v0.27.0-beta  
**Status:** Public Beta reference spec

MP5 metadata is optional. Files must play with only `HEAD` and `AUDI`; missing or unsupported metadata must not block playback.

This document covers the current reference metadata model. v0.27.0-beta does not change chunk semantics and does not add AI generation.

## Principles

- General music tags first: title, artist, album, cover art, lyrics, and optional waveform/seek data.
- Content guidance is informational and user/artist/tool supplied; it does not change decode or playback.
- Rights and identifiers are informational only. MP5 does not enforce DRM, verify ownership, or provide legal proof.
- Specialized app metadata is optional and ignorable by general players.
- The reference converter does not automatically generate warnings, lyrics, stems, or AI metadata.

## User-Facing Groups

| Internal chunk | User-facing label |
|----------------|-------------------|
| `META` | Track info |
| `COVR` | Cover art |
| `LYRC` | Lyrics |
| `EXPL` / `SAFE` / `SENS` | Content guidance |
| `RECV` | Specialized app profile |
| `MOOD` / `VIBE` | Mood and vibe |
| `SECT` / `HOOK` / `HILT` | Song map |
| `VISU` | Visual theme |
| `CRDT` / `LICN` / `IDEN` | Credits, rights, identifiers |
| `FING` / `HASH` | Fingerprint and integrity metadata |

## Chunk Overview

| FourCC | Required | Role |
|--------|----------|------|
| `META` | no | Standard key/value tags |
| `COVR` | no | Cover art |
| `LYRC` | no | Unsynced and synced lyrics |
| `EXPL` | no | Explicit/content notices |
| `SAFE` | no | Sensitive/emotional themes |
| `SENS` | no | Listener comfort/sensory notes |
| `RECV` | no | Specialized app/recovery-aware profile fields |
| `MOOD` / `VIBE` | no | Discovery/display tags |
| `STEM` / `STDA` / `STDF` | no | Optional user/artist-provided stems |
| `SECT` / `HOOK` / `HILT` | no | Song sections and highlight moments |
| `VISU` | no | Player visual theme metadata |
| `CRDT` / `LICN` / `IDEN` | no | Credits, rights notes, release identifiers |
| `FING` / `HASH` | no | Local duplicate/integrity metadata |

## `LYRC` Lyrics

`LYRC` is JSON with optional unsynced and synced lyrics. There is no AI lyric generation in the reference converter.

```json
{
  "unsynced": "Plain lyrics text",
  "synced": [
    {
      "timeMs": 12500,
      "text": "Example lyric line",
      "section": "Chorus",
      "source": "user"
    }
  ],
  "source": "user"
}
```

The converter accepts LRC-style synced lines:

```text
[00:12.50] lyric text
[00:15.20|Chorus] next line
```

Invalid lines are omitted with a UI warning. Synced lyrics are optional.

## Content Guidance

| Chunk | Examples |
|-------|----------|
| `EXPL` | explicit content, clean version, strong language, violence, mature themes |
| `SAFE` | grief themes, trauma themes, intense emotional content |
| `SENS` | sudden loud sounds, intense bass, harsh frequencies |
| `RECV` | optional specialized app/recovery-aware fields |

Guidance payloads include source/provenance fields when available. The reference converter records manually entered guidance as user-provided.

## Safety Limits

| Asset | Limit |
|-------|-------|
| Metadata value | 8 KiB per `META` value |
| Optional chunk payload | 64 MiB container cap |
| Cover art | 2 MiB app guidance |

## Related Docs

- [Chunk registry](MP5_CHUNK_REGISTRY.md)
- [Compatibility matrix](MP5_COMPATIBILITY_MATRIX.md)
- [Stems](MP5_STEMS.md)
- [Sections](MP5_SECTIONS.md)
- [Visual themes](MP5_VISUAL_THEMES.md)
- [Credits and rights](MP5_CREDITS_RIGHTS.md)
- [Fingerprint and integrity](MP5_FINGERPRINT_INTEGRITY.md)
