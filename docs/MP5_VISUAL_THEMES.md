# MP5 Visual Themes (VISU)

**Version:** MP5 Audio v0.20.0-beta  
**Status:** Optional display metadata

The optional `VISU` chunk lets a file suggest player colors and mood without affecting audio decode, playback transport, volume, codec policy, or file semantics.

## Scope

VISU is contained to the Now Playing/player visual area. It must not recolor the entire app shell, navigation, converter, library, or settings panels.

| Area | Themed? |
|------|---------|
| Now Playing visual area | yes |
| Cover/art frame | yes |
| Codec/theme badges | yes |
| Metadata VISU panel | yes |
| Waveform accent | partial |
| App shell/tabs/global nav | no |
| Converter/library/settings | no |

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `version` | number | Optional; `1` |
| `themeName` | string | Short display label |
| `primaryColor` | hex | `#rrggbb` or `#rgb` |
| `secondaryColor` | hex | Optional |
| `accentColor` | hex | Optional |
| `backgroundColor` | hex | Optional |
| `textColor` | hex | Used only when readable |
| `moodLabel` | string | Display hint |
| `visualIntensity` | `low` / `medium` / `high` | UI emphasis hint |
| `playerStyle` | `calm` / `bold` / `minimal` / `cinematic` / `neon` / `custom` | Display hint |
| `gradientStops` | string[] | Up to 8 hex stops |
| `source` | `user` / `artist` / `app` / `unknown` | Provenance |

Invalid colors are dropped on decode/encode. Strings are sanitized.

## Principles

- Optional and ignorable.
- Display-only.
- Manual/user/app supplied in the reference converter; no AI palette extraction.
- Safe hex colors only; no arbitrary CSS or HTML from files.
- Accessible contrast preferred when possible.

## Tooling

`pnpm inspect:mp5 <file>` reports whether VISU has embedded hex colors or metadata-only style hints.

See [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) and [MP5_CHUNK_REGISTRY.md](MP5_CHUNK_REGISTRY.md).
