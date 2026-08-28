# MP5 Visual Themes (VISU)

**Version:** MP5 Audio v0.30.1-beta
**Status:** Optional display metadata

The optional `VISU` chunk lets a file suggest player colors and mood without affecting audio decode, playback transport, volume, codec policy, or file semantics.

## Scope

VISU supplies an app-wide accent while a themed file is active and file themes are enabled. The accent can recolor interactive chrome, but it must not replace the neutral page surfaces or turn cover art into a global wallpaper.

Color roles are deliberate:

- `primaryColor` carries identity: the main MP5 logo bars, larger surface washes, and structural borders.
- `secondaryColor` supports the identity: the unplayed waveform, opposite-side gradients, secondary buttons, and supporting chrome.
- `accentColor` marks interaction: the logo accent bar, active controls, tabs, progress, and focus states.

If secondary is omitted, players fall back to primary and then accent. If primary is omitted, accent fills the primary role.

| Area | Themed? |
|------|---------|
| Now Playing visual area | yes |
| Cover/art frame | yes |
| Codec/theme badges | yes |
| Metadata VISU panel | yes |
| Waveform accent | yes |
| App shell/tabs/global nav accents | yes |
| Audio-reactive Now Playing bars | yes |
| Converter/library/settings accents | yes |
| Main page/panel backgrounds | no |
| Global cover-art wallpaper | no |

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `version` | number | Optional; `1` |
| `themeName` | string | Short display label |
| `primaryColor` | hex | `#rrggbb` or `#rgb` |
| `secondaryColor` | hex | Supporting theme role; optional with primary/accent fallback |
| `accentColor` | hex | Active interaction role; optional |
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
- Manual/user/app supplied in the reference converter. The opt-in AI review flow can derive a palette from embedded
  cover art locally; artwork is not uploaded and the user must accept the suggestion before export. Local palette
  suggestions include a distinct secondary color and receive a stable display name based on album, song, or artist
  metadata plus the derived color mood.
- Safe hex colors only; no arbitrary CSS or HTML from files.
- Accessible contrast preferred when possible.
- Active file accents reset to the default app theme when VISU is disabled, the queue is cleared, or the current file has no VISU metadata.
- Reactive bars read the active playback analyser and use the track's primary, secondary, and accent colors. Reduced-motion users receive a stable, non-animated profile.

## Tooling

`pnpm inspect:mp5 <file>` reports whether VISU has embedded hex colors or metadata-only style hints.

See [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) and [MP5_CHUNK_REGISTRY.md](MP5_CHUNK_REGISTRY.md).
