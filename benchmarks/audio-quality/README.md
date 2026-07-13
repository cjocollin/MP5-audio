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
- **MP5-C** is lossy on every fixture; full-song SNR hides quiet-passage hiss, so
  quiet-window SNR and the null test are the honest measures → stays lab-only.
- **MP5-H + CORR** is sample-exact content but larger than MP5-L → not default.
- **MP5-C vNext** is an experimental, default-OFF prototype (lossless fallback for
  quiet blocks).

No copyrighted audio and no telemetry are ever produced here. Listening WAVs and
per-run reports stay local.
