# MP5 Visual Themes (VISU) — MVP

**Version:** MP5 Audio v0.12.1-alpha

Optional **VISU** chunk metadata lets an MP5 file suggest player chrome colors and mood **without affecting audio decode or playback**.

## Alpha scope (what VISU affects)

When **Apply VISU file themes** is on, only the **Now Playing** area is themed — not the whole app shell, tabs, or other panels.

| Area | Themed? | Notes |
|------|---------|--------|
| Now Playing shell | Yes | Subtle border + tint wash on the Now Playing card wrapper only |
| Cover / art card | Yes | Accent ring and scrim overlay; cover `<img>` clipped inside the card |
| Codec + theme badges | Yes | Accent border/background |
| Track title | Yes | Readable text + subtle accent glow |
| Metadata VISU panel | Yes | Swatches show **resolved** colors; theme status line |
| Waveform (optional) | Yes | Played bars use VISU accent when simple |
| Waveform + transport controls | No | Default app surface (no VISU wallpaper) |
| Converter / Library / Settings tabs | No | Default app theme |
| Global nav / tab bar | No | Unchanged — never overlaid by cover art |

Files with VISU metadata but **no hex colors** (e.g. Pity Party) use a **playerStyle preset** (`cinematic`, `neon`, …) so the player is visibly different from default purple — not metadata-only invisible styling.

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

**v0.10.7:** Stronger player-only theming — cover art gets a visible accent ring and gradient scrim so themes show even with full-bleed artwork; player column border/wash; waveform accent; metadata status line (`File theme applied` / `Theme source`).

**v0.10.5:** Files with VISU metadata but **no hex colors** use **style preset palettes** (`cinematic`, `neon`, etc.). `pnpm inspect:mp5` reports `VISU colors: embedded hex` vs `metadata only`.

1. Apply CSS variables on the active player column (`--mp5-visu-accent`, etc.).
2. Now Playing shell + cover card gradients, border, and overlay.
3. Accent-styled codec/theme badges and theme name badge.
4. Metadata panel: theme fields, **resolved** color swatches, and theme status line.

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
