# MP5 Format Specification (v0.1)

## Overview

MP5 is an experimental audio ecosystem:

- **Container** — chunk-based `.mp5` file (`MP5A` magic)
- **Codecs** — MP5-C (lossy), MP5-L (lossless), MP5-H (hybrid)
- **Optional metadata** — AI, warnings, stems, advanced/moonshot chunks

Core playback requires only `HEAD` + `AUDI`. All enrichment chunks are optional.

## Terminology

| Term | Meaning |
|------|---------|
| Container | File format: chunks (HEAD, META, AUDI, …) |
| Codec | Bitstream inside AUDI (+ CORR for MP5-H) |
| Encoder/Decoder | Rust implementation (WASM/native) |
| Player | Parses container, decodes, plays audio |

## Codec IDs

| ID | Codec |
|----|-------|
| 0 | PCM fallback |
| 1 | MP5-C experimental lossy |
| 2 | MP5-L experimental lossless |
| 3 | MP5-H hybrid |
| 4 | External passthrough |
| 255 | Private/experimental |

## Core chunks (MVP)

| FourCC | Purpose |
|--------|---------|
| HEAD | Global header |
| META | Title, artist, album, … |
| COVR | Cover art |
| AUDI | Encoded audio frames |
| SEEK | Seek table |
| WAVE | Waveform preview |
| INFO | Encoder/source info |
| CORR | Hybrid correction (MP5-H) |

## Optional chunks

See [AI_METADATA_SPEC.md](./AI_METADATA_SPEC.md), [MP5_CONTENT_WARNINGS.md](./MP5_CONTENT_WARNINGS.md), [MP5_ADVANCED_FEATURES.md](./MP5_ADVANCED_FEATURES.md), [MP5_MOONSHOT_FEATURES.md](./MP5_MOONSHOT_FEATURES.md).

## Feature maturity

| Tier | Build in MVP? |
|------|---------------|
| MVP | Yes |
| Planned | No — display stubs |
| Experimental | No |
| Advanced | No |
| Moonshot | Spec only |

See [MP5_ROADMAP.md](./MP5_ROADMAP.md).

## Forward compatibility

Unknown FourCC chunks: read size, verify CRC if flagged, skip. Never required for decode.

## Honesty

MP5 is experimental. Do not claim superiority over established formats without benchmark data.
