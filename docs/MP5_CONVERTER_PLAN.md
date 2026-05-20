# MP5 Converter Plan

## Source formats

Decode via FFmpeg only: MP3, WAV, FLAC, AAC, M4A, OGG, Opus → PCM.

## Encode

PCM → MP5-C / MP5-L / MP5-H via Rust WASM.

## Output chunks (MVP)

HEAD, META, COVR, AUDI, SEEK, WAVE, INFO.

## FFmpeg paths

- Web: `@ffmpeg/ffmpeg` (lazy-loaded)
- Tauri: native FFmpeg sidecar

## Validation

Re-parse output; optional decode smoke test.

## Future

AI metadata hooks, multi-stem import, warning editor.
