# Optional Metadata Registry

**Version:** MP5 Audio v0.25.0-beta  
**Status:** Legacy filename; optional metadata reference (includes opt-in AI suggestions)

This file keeps the historical `AI_METADATA_SPEC.md` path working. The listed chunks are optional metadata/enrichment chunks. Files without them decode and play normally.

## Chunks

| FourCC | Purpose | Public Beta status |
|--------|---------|--------------------|
| `MOOD` | Mood tags, intensity, energy | implemented metadata |
| `VIBE` | Use-case tags such as focus/sleep/workout | implemented metadata |
| `SECT` | Song structure sections | implemented metadata |
| `LYRC` | Synced/unsynced lyrics | implemented metadata |
| `STEM` | User/artist-provided stem manifest | implemented metadata |
| `BEAT` | BPM, key, time signature | implemented metadata |
| `SUMM` | One-line track summary | implemented metadata |
| `FING` | Fingerprint/library identity | implemented metadata |
| `RECS` | Recommendation-hint reservation | registry only |
| `VISU` | Visual theme metadata | implemented metadata |

## BEAT payload (JSON)

```json
{
  "bpm": 128.4,
  "key": "Am",
  "timeSignature": "4/4",
  "confidence": 0.82,
  "source": "ai-local",
  "analyzer": "mp5-beat-local"
}
```

## SUMM payload (JSON)

```json
{
  "text": "Melancholic indie track with sparse guitar.",
  "source": "ai-cloud",
  "model": "gpt-5.4-nano",
  "generatedAt": "2026-06-16T12:00:00Z"
}
```

## Provenance

MOOD/VIBE/BEAT/SUMM support a `source` field:

- `user` — manual entry in the converter
- `ai-local` — on-device analysis (e.g. BPM)
- `ai-cloud` — user-supplied API key; cloud model suggestion
- `embedded` / `unknown` — reserved for future import paths

Content guidance chunks (`EXPL`, `SAFE`, `RECV`, `SENS`) support `aiGenerated: true` when AI-suggested warnings are added in a future release.

## Parser Behavior

- Missing optional metadata: OK.
- Unknown optional chunk: skip safely after size/CRC checks.
- Invalid optional CRC: drop the optional chunk and continue core playback.

## Product Boundary

- **Opt-in AI suggestions** are available in Settings and the converter: local BPM analysis plus optional cloud features — BPM/key and structure (audio clip), lyrics transcription, content warnings, mood/vibe/summary (BYOK). Suggestions are **review-before-export** only.
- **No AI stem separation** is included.
- Cloud AI requires a user-provided API key stored locally in the browser; MP5 does not host or proxy AI calls by default.
