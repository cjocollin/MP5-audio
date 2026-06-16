# MP5 Fixture Catalog

**Version:** MP5 Audio v0.20.0-beta
**Status:** Public Beta synthetic fixture policy

All committed fixtures must be synthetic/demo-safe. Do not commit copyrighted, private, downloaded, or personally identifying audio. Local real-music packages such as HADES or Pity Party are manual-only and must remain outside the repo.

## Demo fixtures

| Fixture | Kind | Codec/profile | Covers | Expected validation |
|---------|------|---------------|--------|---------------------|
| `test-fixtures/demo_pcm_reference_tone.mp5` | `.mp5` | PCM reference/debug | Basic metadata + audio | `pnpm validate:mp5 test-fixtures/demo_pcm_reference_tone.mp5 --profile playable` |
| `test-fixtures/demo_mp5l_v3_tone.mp5` | `.mp5` | MP5-L v3 recommended lossless | Metadata, cover, waveform, optional chunks | `pnpm validate:mp5 test-fixtures/demo_mp5l_v3_tone.mp5 --profile rich` |
| `test-fixtures/demo_mp5c_lab_tone.mp5` | `.mp5` | MP5-C lab-only | Lab codec warning path | `pnpm inspect:mp5 test-fixtures/demo_mp5c_lab_tone.mp5` |
| `test-fixtures/demo_mp5l_v3_stems.mp5` | `.mp5` | MP5-L v3 | STEM/STDA, LYRC, SECT/HOOK/HILT, VISU | `pnpm validate:mp5 test-fixtures/demo_mp5l_v3_stems.mp5 --profile rich` |
| `test-fixtures/validation_pcm_slice.mp5` | `.mp5` | PCM reference/debug | Small validation slice | `pnpm validate:mp5 test-fixtures/validation_pcm_slice.mp5 --profile playable` |
| `test-fixtures/validation_mp5l_v3.mp5` | `.mp5` | MP5-L v3 | MP5-L validation | `pnpm validate:mp5 test-fixtures/validation_mp5l_v3.mp5 --profile rich` |

Generate with:

```bash
pnpm fixtures:generate
```

## Album package fixtures

| Fixture | Kind | Package profile | Covers | Expected validation |
|---------|------|-----------------|--------|---------------------|
| `test-fixtures/demo_album_package.mp5p` | manifest `.mp5p` | `mp5-album-manifest-v1` | JSON manifest + sidecar `.mp5` tracks | `pnpm validate:mp5p test-fixtures/demo_album_package.mp5p --dir test-fixtures --profile package` |
| `test-fixtures/demo_embedded_album_package.mp5p` | embedded `.mp5p` | `mp5-album-embedded-v1` | Embedded `.mp5` track fragments + CRC | `pnpm validate:mp5p test-fixtures/demo_embedded_album_package.mp5p --profile package` |

Generate embedded package with:

```bash
pnpm fixtures:embedded-album
node scripts/validate-embedded-album-package.mjs
```

## Compatibility fixtures

Compatibility fixtures live under `test-fixtures/compatibility/` and are generated from synthetic tones.

| Fixture group | Purpose | Expected command |
|---------------|---------|------------------|
| `wav_*` | Source WAV compatibility fixtures for export/roundtrip tests. | `pnpm test:compat` |
| `mp5l_metadata_full.mp5` | Rich MP5-L metadata path. | `pnpm inspect:mp5 test-fixtures/compatibility/mp5l_metadata_full.mp5` |
| `mp5l_missing_artist.mp5` | Missing optional metadata field behavior. | `pnpm validate:mp5 test-fixtures/compatibility/mp5l_missing_artist.mp5 --profile playable` |
| `mp5l_missing_title.mp5` | Missing optional metadata field behavior. | `pnpm validate:mp5 test-fixtures/compatibility/mp5l_missing_title.mp5 --profile playable` |
| `mp5l_long_title.mp5` | Long metadata value handling. | `pnpm inspect:mp5 test-fixtures/compatibility/mp5l_long_title.mp5` |
| `mp5c_lab.mp5` | MP5-C lab-only warning path. | `pnpm inspect:mp5 test-fixtures/compatibility/mp5c_lab.mp5` |
| `mp5h_with_corr.mp5` | MP5-H with correction chunk. | `pnpm validate:mp5 test-fixtures/compatibility/mp5h_with_corr.mp5 --profile playable` |
| `mp5h_no_corr.mp5` | MP5-H warning without CORR. | `pnpm inspect:mp5 test-fixtures/compatibility/mp5h_no_corr.mp5` |
| `mp5l_with_cover.mp5` | Cover-art parsing. | `pnpm validate:mp5 test-fixtures/compatibility/mp5l_with_cover.mp5 --profile rich` |
| `mp5l_unknown_futr.mp5` | Unknown optional chunk handling. | `pnpm inspect:mp5 test-fixtures/compatibility/mp5l_unknown_futr.mp5` |

`pnpm compatibility:check` regenerates the synthetic compatibility set. Compressed source fixtures may be skipped when `ffmpeg` is not on PATH; WAV and MP5 edge-case tests still run.

## Manual-only files

Real local files used during personal QA, such as HADES or Pity Party packages, are not repo assets and must not be committed. They may be used only for local manual testing when the owner explicitly permits it, and they must not be uploaded or referenced as required fixtures.
