# MP5 Roadmap

## Five-tier feature model

1. **MVP (v0.1)** — HEAD, META, COVR, AUDI, SEEK, WAVE, INFO, CORR; MP5-C/L/H; converter; player
2. **Planned (v0.2)** — LYRC, MOOD, VIBE, BEAT, EXPL, SAFE, RECV, SENS display
3. **Experimental (v0.3)** — STEM, SECT, HOOK, HILT, VERS, QUAL, KARA
4. **Advanced (v0.4+)** — ALBM, LAYS, MIXR, LICN, CRDT, ACCS, …
5. **Moonshot (research)** — ADPT, BRCH, AIRG, … — see [MP5_MOONSHOT_FEATURES.md](./MP5_MOONSHOT_FEATURES.md)

## Phases

| Phase | Deliverable |
|-------|-------------|
| 1 | Specs + scaffold |
| 2 | Container |
| 3 | MP5-L |
| 4 | MP5-C |
| 5 | MP5-H |
| 6 | Converter |
| 7 | Player |
| 8 | Benchmarks (MP5-H: `pnpm bench:mp5h-validation`; MP5-L: `pnpm bench:mp5l-compression`) |
| 9 | PWA / Tauri / Capacitor |
| 10+ | AI enrichment, advanced, moonshot |

## AI Metadata Layer

Optional chunks: MOOD, VIBE, SECT, LYRC, STEM, BEAT, SUMM, FING, RECS, VISU. Never required for playback.

## Content Warning Metadata

EXPL (explicit), SAFE (emotional), RECV (recovery), SENS (sensory). See [MP5_CONTENT_WARNINGS.md](./MP5_CONTENT_WARNINGS.md).

## Future Advanced Features

See [MP5_ADVANCED_FEATURES.md](./MP5_ADVANCED_FEATURES.md).

## MP5 Moonshot Features

Spec-only until gate checklist passes. See [MP5_MOONSHOT_FEATURES.md](./MP5_MOONSHOT_FEATURES.md).
