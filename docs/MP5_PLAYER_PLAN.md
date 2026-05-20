# MP5 Player Plan

## Pipeline

Parse container → WASM decode → Web Audio API (AudioWorklet or buffer queue).

## MVP UI

Cover, metadata, play/pause, seek, waveform, volume, playlist, codec badge, converter tab, settings (theme).

## Optional display

LYRC, MOOD/VIBE/SUMM/BEAT, EXPL/SAFE/RECV/SENS panels when chunks present.

## Future UI

Mood filters, smart playlists, jump-to-hook, stem mixer, karaoke, AI DJ, ALBM mode, NOTE/MEMR (local).

## Degradation

Missing/unknown chunks never block playback.

## Honesty banner

"MP5 is experimental. Metrics are informational, not quality guarantees."
