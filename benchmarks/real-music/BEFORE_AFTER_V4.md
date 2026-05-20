# ORIGAMI full song — v3 vs v4 (MP5-C)

| Preset | v3 ratio | v3 SNR | v4 ratio | v4 SNR | Notes |
|--------|----------|--------|----------|--------|-------|
| Low | 0.79 | 18.6 dB | 0.89 | 21.6 dB | Preview only |
| **Standard** | **0.87** | **24.5 dB** | **0.96** | **32.6 dB** | v4: cleaner, less compression |
| **High** | **0.92** | **30.5 dB** | **0.97** | **36.4 dB** | v4: recommended default |
| Extreme | 0.95 | 36.8 dB | 0.98 | 39.9 dB | Quality-first |

48 kHz native vs 44.1 kHz resampled (Standard v4): SNR ~32.6 vs ~32.5 dB — resampling is not the main noise source.

Root cause of v3 Standard hiss: coarse fixed quant step (0.05) + mid/side on wide stereo + dense i16 frames on high-entropy electronic content; audible quantization floor especially in quieter passages.

**Fresh listening exports (v4):** `pnpm export:origami-listening` → `listening/` + Desktop `ORIGAMI-listening-exports/`.

**v5 packing (same quant):** `pnpm bench:v5-compare` → `V4_VS_V5.md` — High 0.974→0.955× PCM, dense 90%→84.5%, SNR unchanged.
