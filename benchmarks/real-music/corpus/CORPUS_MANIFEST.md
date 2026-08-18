# MP5 real-music corpus freeze

Machine-readable source of truth: [`corpus-manifest.json`](./corpus-manifest.json)
(`manifestId`: `mp5-real-music-corpus-v1`).

## Targets vs registered

| Role | Target | Registered | Shortfall |
|------|-------:|-----------:|----------:|
| dev | 30 | 20 | 10 |
| held-out | 20 | 40 | 0 |

## Policy

- **Held-out is sealed.** Tuning commands must not consume `role: held-out` tracks
  unless `--allow-held-out` is passed with an explicit `--held-out-reason`.
- Verify on disk: `node tools/audio-lab/corpus.mjs verify`
- Rebuild hashes after adding local files: `node tools/audio-lab/corpus.mjs register`
- Audio files remain git-ignored; only the manifest + hash list are committed.

## Layout

| Role | Path |
|------|------|
| **dev** | corpus root (`origami_*.flac`), `tuning/` |
| **held-out** | `held-out/`, `speech-held-out/` |
