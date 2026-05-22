# MP5 Visual Themes (VISU) — MVP

**Version:** MP5 Audio v0.10.6-alpha

Optional **VISU** chunk metadata lets an MP5 file suggest player chrome colors and mood **without affecting audio decode or playback**.

## Principles

- **Optional** — files without VISU play normally with the default app theme.
- **Display-only** — no codec, routing, or volume changes.
- **Manual in MVP** — converter fields only; no AI color extraction from cover art yet.
- **Safe** — hex colors only; strings sanitized; no arbitrary CSS from files.
- **Accessible** — text on themed backgrounds prefers WCAG-friendly contrast when possible.
- **Ignorable** — third-party players may skip VISU entirely.

## VISU JSON schema (version 1)

| Field | Type | Notes |
|-------|------|--------|
| `version` | number | Optional; encoder may set `1` |
| `themeName` | string | Short label shown in player/metadata |
| `primaryColor` | string | `#rrggbb` or `#rgb` |
| `secondaryColor` | string | Hex |
| `accentColor` | string | Hex — badges, highlights |
| `backgroundColor` | string | Hex — soft card/gradient base |
| `textColor` | string | Hex — used when contrast vs background is sufficient |
| `moodLabel` | string | e.g. calm, energetic |
| `visualIntensity` | `low` \| `medium` \| `high` | UI emphasis hint |
| `playerStyle` | `calm` \| `bold` \| `minimal` \| `cinematic` \| `neon` \| `custom` | Layout mood hint |
| `gradientStops` | string[] | Up to 8 hex stops for background gradient |
| `coverArtDerived` | boolean | Hint that colors were derived from cover (manual flag only in MVP) |
| `source` | `user` \| `artist` \| `app` \| `unknown` | Provenance |

At least one of `themeName`, a color, `moodLabel`, `visualIntensity`, or `playerStyle` is required for a non-empty chunk.

Invalid hex values are **dropped** on decode/encode. Theme names and labels pass through `sanitizeMetadata` (control chars stripped, length capped).

## Reference player behavior

When **Apply VISU file themes** is enabled (Settings, default on):

1. Decode VISU from the current track’s optional map.

**v0.10.5:** Files with VISU metadata but **no hex colors** (theme name, mood, `playerStyle` only) use a **style preset palette** (`cinematic`, `neon`, etc.) so Now Playing and badges visibly change. Metadata panel notes when colors are preset-derived vs embedded. `pnpm inspect:mp5` reports `VISU colors: embedded hex` vs `metadata only`.
2. Apply CSS variables on the Now Playing column (`--mp5-visu-accent`, etc.).
3. Soft gradient on the cover card when `backgroundColor` / `gradientStops` are present.
4. Accent-styled codec/theme badges.
5. Metadata panel shows theme name, mood, style, source, and color swatches.

When disabled, or when VISU is missing, the app uses the normal dark/light theme only.

## Converter

**Visual theme** section in the metadata editor:

- Theme name, primary/accent/background colors (hex)
- Mood label, visual intensity, player style
- Exported as VISU with `source: user` when any field is set

## Demo fixture

`test-fixtures/demo_mp5l_v3_stems.mp5` includes VISU:

- Theme: **Calm demo**
- Colors: indigo/violet on deep blue background
- `source: app`, `playerStyle: calm`, `visualIntensity: low`

Load via **Load karaoke demo** in the player.

## Limitations (MVP)

- No AI palette extraction from cover art
- No animated visualizers or beat-reactive graphics
- No per-section color overrides (use SECT `colorHint` in future)
- Player style / intensity are metadata hints only — limited UI mapping today
- No export of arbitrary CSS or HTML
- Settings toggle is per-browser (localStorage), not per-file

## Implementation

| Area | Location |
|------|----------|
| Encode/decode | `packages/mp5-container/src/visu.ts` |
| Aggregator | `parseOptionalMetadata()` in `optionalChunks.ts` |
| Player apply | `apps/web/src/lib/visualTheme/` |
| Converter | `MetadataEditor.tsx`, `manualMetadata.ts` |

See also [`MP5_METADATA_SPEC.md`](MP5_METADATA_SPEC.md) and [`AI_METADATA_SPEC.md`](AI_METADATA_SPEC.md).
