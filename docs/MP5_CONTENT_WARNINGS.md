# Content Warning Metadata

Four separate optional chunks:

| Chunk | Domain |
|-------|--------|
| EXPL | Explicit/mature content |
| SAFE | Emotional/listener safety |
| RECV | Recovery-sensitive |
| SENS | Sensory overload |

## EXPL

```json
{
  "explicit": true,
  "cleanVersionAvailable": true,
  "contentWarnings": ["strong language", "drug references"],
  "ageRating": "mature",
  "cleanVersionRef": "VERS:CLEAN",
  "cleanStemRef": "STEM:clean_vocals",
  "warningSource": "artist",
  "aiGenerated": false
}
```

## SAFE

Grief, trauma, panic-heavy, distressing themes (non-explicit).

## RECV

`recoverySafe`, `groundingFriendly`, trigger tags, hopeful/grounding timestamps.

## SENS

Sudden loud sounds, harsh frequencies, flashing visuals, intense bass, sensory overload risk.

## Player

- Show badges when present
- Opt-in filters only — **never block playback by default**
- Clean play when `cleanVersionRef` / `cleanStemRef` available
