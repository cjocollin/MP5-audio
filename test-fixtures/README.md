# MP5 Alpha demo fixtures

Small **synthetic** test tones (440 Hz sine, 2 s, mono, 44.1 kHz). No copyrighted music is included in the repository.

| File | Codec | Use |
|------|-------|-----|
| `demo_mp5l_v3_tone.mp5` | **MP5-L v3** (lossless · default) | Primary demo — drop in Player |
| `demo_pcm_reference_tone.mp5` | PCM (reference / debug) | Uncompressed container baseline |
| `demo_mp5c_lab_tone.mp5` | MP5-C (experimental / lab) | Lossy lab codec — **may hiss** |

Legacy names used by automated tests: `validation_mp5l_v3.mp5`, `validation_pcm_slice.mp5` (same content as the `demo_*` files).

## Regenerate

```bash
pnpm fixtures:generate
```

Requires `pnpm wasm:build` (script runs container build + WASM first).

## Compatibility fixtures

Synthetic WAV + MP5 edge-case files for the real-world compatibility pass live in `test-fixtures/compatibility/`.

```bash
pnpm compatibility:fixtures   # generate only
pnpm compatibility:check      # generate + run tests
```

See [`docs/MP5_COMPATIBILITY_REPORT.md`](../docs/MP5_COMPATIBILITY_REPORT.md).
