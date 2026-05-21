# AI Metadata Specification (optional)

All AI chunks are **optional**. Files without them decode and play normally.

## Chunks

| FourCC | Purpose |
|--------|---------|
| MOOD | Mood tags, intensity, energy |
| VIBE | Use-case tags (focus, sleep, workout, …) |
| SECT | Song structure sections |
| LYRC | Synced/unsynced lyrics |
| STEM | Separated stems (see MP5_ADVANCED_FEATURES) |
| BEAT | BPM, key, beat grid |
| SUMM | AI summary |
| FING | Fingerprint |
| RECS | Playlist/DJ hints |
| VISU | Visual theme (hex colors, mood, player style) — see [`MP5_VISUAL_THEMES.md`](MP5_VISUAL_THEMES.md) |

## Flags

Per-chunk or global: `ai_generated`, `user_edited`.

## Parser behavior

- Missing chunk: OK
- Unknown chunk: skip safely
- Invalid optional CRC: drop chunk, continue decode

## Converter

MVP: no AI generation. `AiMetadataProvider` hook for future local/cloud analysis.

## Player

Display when present; label AI-generated content; allow local overrides without rewriting file.
