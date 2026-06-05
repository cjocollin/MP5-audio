# MP5 Alpha screenshots

Screenshots for README, docs, and the public landing page.

| File | View |
|------|------|
| `Player.png` | Player tab — playlist, playback controls, Format panel |
| `Converter.png` | Converter tab — import, MP5-L v3 export flow |
| `Metadata.png` | Metadata editor — title, cover, lyrics, optional guidance |

## Usage

- **GitHub README:** relative paths under `docs/screenshots/`
- **Hosted demo:** copied to `/screenshots/` at build time (see `apps/web/fixturesPlugin.ts`)

## Policy

- No fake or AI-generated screenshots
- No copyrighted album art in marketing images
- Use synthetic demo tone or user-owned audio only

## Optional future captures (v0.15+)

These are **not yet checked in** — placeholders only until captured from the live app:

- Compact landing hero (title, tagline, version badge, Demo guide button)
- Player with VISU in Now Playing
- Batch album builder export summary
- Embedded album package panel
- Mobile viewport (375px) — tabs + player controls

When adding new PNGs, update this table and verify `pnpm deploy:check` still passes.
