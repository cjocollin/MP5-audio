# MP5-C codec diagnostics (ORIGAMI full, Standard v4)

BitstreamDiag { version: 4, channels: 2, preset: 1, frames_per_ch: 3623, total_bytes: 28555948, frame_header_bytes: 28984, payload_bytes: 28526956, silence_frames: 80, rice_frames: 938, dense_frames: 6228, avg_payload_bytes: 3936.9246480817, max_payload_bytes: 4096, overhead_pct: 0.10152700936421372, estimated_bitrate_kbps: 1477.9907749950364, stereo_mode: "L/R (v4)" }


## Notes
- v4: L/R stereo + per-frame adaptive step (quieter frames finer quant).
- Most frames use dense i16 packing — high entropy material (noise/transients).
- Base quant step for Standard: 0.0280 (uniform quant noise floor ~-37.1 dBFS RMS)

## Per-window SNR
| Window | SNR dB | RMS err | Peak err | Clips |
|--------|--------|---------|----------|-------|
| intro (0-30s) | 32.0 | 0.0080 | 0.0152 | 582 |
| vocal_mid (30-60s) | 32.5 | 0.0079 | 0.0154 | 1114 |
| dense_mid (60-90s) | 33.2 | 0.0079 | 0.0153 | 1777 |
| outro_tail (125-155s) | 34.1 | 0.0077 | 0.0153 | 610 |
