# `benchmarks/audio-quality/`

Output directory for the **MP5 Audio Quality Lab** (`tools/audio-lab`).

Generated reports here are **git-ignored** (see `.gitignore`) because they are
machine-specific and re-creatable. Regenerate any time:

```bash
pnpm audio:bench            # report-all.{json,csv,md}
pnpm audio:quality-report   # QUALITY_REPORT.md
pnpm audio:null-test        # NULL_TEST.md + null-test.json
pnpm audio:export-listening # listening/<fixture>/<mode>.wav  (also ignored)
```

What the reports tell you:

- **MP5-L** is bit-exact on every fixture (digital-silence null) → recommended default.
- **MP5-C classic (legacy)** is lossy on every fixture; full-song SNR hides quiet-passage
  hiss, so quiet-window SNR and the null test are the honest measures → stays lab-only.
- **MP5-H + CORR** is sample-exact content but larger than MP5-L → not default.
- **MP5-C2 / vNext** (`CodecId` 5) is **lossless / bit-exact** — the shipping encoder picks
  `min(TAG_SR+CORR, TAG_LOSSLESS)` per loud unit. It stays default-OFF because it is
  *slightly larger* than MP5-L, not because of artifact risk.

## Tracked artifacts

### `c2-real-track-remeasure.json` — current MP5-C2 size

Produced by `node tools/audio-lab/remeasure-c2.mjs --segments`. Measures the shipping
`encode_mp5c_vnext_at` (preset 2) against `encode_mp5l_v4` and raw PCM on the local ORIGAMI
segment excerpts, and verifies decode is sample-for-sample equal to the source. **This is the
number public copy should cite for C2.**

### `vnext-real-track-gate.json` — SUPERSEDED for C2 size and bit-exactness

Its C2 rows (`contentBitExact: false`, `ratioVsPcm` ≈ 0.977, `bytes` 32272179) come from an
**older encoder revision whose loud path still emitted lossy `TAG_LOSSY` units**, padded into
2048-frame MP5-C frames — which is why it sat near MP5-C size at ~0.98× PCM. The shipping
encoder no longer emits those units, so both the "not bit-exact" flag and the ~0.98× PCM ratio
are wrong for `CodecId` 5 today. The `hissRisk` / `tailSnrDb` / `fullSnrDb` columns are
likewise meaningless for a bit-exact codec.

The file is kept as-is for history and because its `mdctTrials` rows are still the live
reference for the **lossy MDCT research path**. Do not cite its C2 rows in docs or UI copy.

No copyrighted audio and no telemetry are ever produced here. Listening WAVs and
per-run reports stay local.
