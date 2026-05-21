# MP5 Alpha demo fixtures

Small **synthetic** test tones (440 Hz sine, 2 s, mono, 44.1 kHz). No copyrighted music is included in the repository.

| File | Codec | Use |
|------|-------|-----|
| `demo_mp5l_v3_tone.mp5` | **MP5-L v3** (lossless · default) | Primary demo — drop in Player |
| `demo_pcm_reference_tone.mp5` | PCM (reference / debug) | Uncompressed container baseline |
| `demo_mp5c_lab_tone.mp5` | MP5-C (experimental / lab) | Lossy lab codec — **may hiss** |
| `demo_mp5l_v3_stems.mp5` | MP5-L v3 + STEM/LYRC/SECT | Full demo: stems, synced lyrics, song map, HOOK, HILT |

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

## Golden fixtures (v0.9 validation profiles)

| File | Profile | Contents |
|------|---------|----------|
| `demo_mp5l_v3_tone.mp5` | rich | Minimal MP5-L v3 tone |
| `demo_mp5l_v3_stems.mp5` | rich | Stems, synced LYRC, SECT, HOOK, HILT, VISU |
| `demo_pcm_reference_tone.mp5` | playable | PCM reference |
| `demo_mp5c_lab_tone.mp5` | playable | MP5-C lab |
| `demo_album_package.mp5p` | package | Album manifest (2+ tracks) |
| `compatibility/mp5l_metadata_full.mp5`* | rich | Full META edge cases |
| `compatibility/mp5l_with_cover.mp5`* | rich | COVR |
| `compatibility/mp5h_with_corr.mp5`* | playable | MP5-H + CORR |
| `compatibility/mp5h_no_corr.mp5`* | playable | MP5-H warning case |
| `compatibility/mp5l_unknown_futr.mp5`* | playable | Unknown **FUTR** chunk |
| `compatibility/corrupt_truncated.mp5`* | — | Negative test (expect parse fail) |

\*After `pnpm compatibility:fixtures`

```bash
pnpm fixtures:validate
pnpm inspect:mp5 test-fixtures/demo_mp5l_v3_tone.mp5
pnpm validate:mp5 test-fixtures/demo_mp5l_v3_stems.mp5 --profile rich
pnpm validate:mp5p test-fixtures/demo_album_package.mp5p --dir test-fixtures --profile package
```
