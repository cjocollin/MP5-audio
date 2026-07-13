# MP5 Demo Guide

**Version:** MP5 Audio v0.25.0-beta  
**Hosted demo:** https://mp5-audio.vercel.app

Use synthetic fixtures for public demos. Do not use copyrighted/private local audio in a deploy, recording, or release gate.

## Demo Goals

- Show that the hosted app loads and the badge reads `MP5 Public Beta - v0.25.0-beta`.
- Show MP5-L v3 as the recommended lossless path.
- Show optional metadata and package features without implying they are required for playback.
- Keep public claims honest: experimental Public Beta, no beat-codec/DRM/legal-proof/telemetry/upload/cloud-sync claims.

## Path A: MP5-L Demo

1. Open https://mp5-audio.vercel.app.
2. Click **Load MP5-L demo**.
3. Confirm the track loads, source badge shows `.mp5`, MP5-L v3 appears in format details, and play/pause/seek work.

## Path B: Karaoke Demo

1. Open **Demo guide**.
2. Load the karaoke/stems demo.
3. Confirm lyrics appear, karaoke mode toggles on, and player controls remain usable.

## Path C: Embedded Album Demo

1. Open **Demo guide**.
2. Load the embedded album demo.
3. Confirm the album panel opens, **Play all** queues tracks, and Now Playing shows embedded `.mp5p` context.

## Path D: Converter

1. Open **Converter**.
2. Confirm the single-file converter opens.
3. Explain that conversion is browser-local and MP5-L v3 is the recommended export path.

## Path E: Batch

1. Open **Converter -> Batch**.
2. Confirm batch mode and Batch Album Builder open.
3. Explain manifest `.mp5p` versus embedded `.mp5p`: manifest is smaller but needs sidecars; embedded is self-contained but can be large.

## Toolkit Demo

```bash
pnpm inspect:mp5 test-fixtures/demo_mp5l_v3_tone.mp5
pnpm validate:mp5 test-fixtures/demo_mp5l_v3_tone.mp5 --profile playable
pnpm validate:mp5p test-fixtures/demo_album_package.mp5p --dir test-fixtures --profile package
```

## Troubleshooting

| Symptom | Likely cause | Try |
|---------|--------------|-----|
| Hosted app looks stale | Service worker cache | Refresh, then retry |
| Demo fixture missing | Build did not copy fixtures | Run `pnpm build` and `pnpm deploy:check` |
| Conversion fails | FFmpeg WASM load or unsupported source | Refresh; try WAV; check Settings diagnostics |
| Package validation fails | Missing sidecars or corrupt embedded package | Use `validate:mp5p` with `--dir` for manifest packages |
| Mobile layout feels cramped | Dense lyrics/stems/package view | Scroll vertically; report horizontal overflow as a bug |

## Close

Before sharing a production Public Beta deploy, run the local gates and hosted checks in [MP5_HOSTED_DEMO.md](MP5_HOSTED_DEMO.md).
