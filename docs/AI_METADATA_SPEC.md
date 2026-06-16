# Optional Metadata Registry

**Version:** MP5 Audio v0.20.0-beta  
**Status:** Legacy filename; Public Beta optional metadata reference

This file keeps the historical `AI_METADATA_SPEC.md` path working, but the current Public Beta product does **not** generate AI metadata. The listed chunks are optional metadata/enrichment chunks. Files without them decode and play normally.

## Chunks

| FourCC | Purpose | Public Beta status |
|--------|---------|--------------------|
| `MOOD` | Mood tags, intensity, energy | implemented metadata |
| `VIBE` | Use-case tags such as focus/sleep/workout | implemented metadata |
| `SECT` | Song structure sections | implemented metadata |
| `LYRC` | Synced/unsynced lyrics | implemented metadata |
| `STEM` | User/artist-provided stem manifest | implemented metadata |
| `BEAT` | BPM/key/beat-grid reservation | registry only |
| `SUMM` | Summary reservation | registry only |
| `FING` | Fingerprint/library identity | implemented metadata |
| `RECS` | Recommendation-hint reservation | registry only |
| `VISU` | Visual theme metadata | implemented metadata |

## Parser Behavior

- Missing optional metadata: OK.
- Unknown optional chunk: skip safely after size/CRC checks.
- Invalid optional CRC: drop the optional chunk and continue core playback.

## Product Boundary

- No AI generation is included in v0.20.0-beta.
- No AI stem separation is included.
- Any future generated/suggested metadata would need clear provenance labels and explicit user control.
