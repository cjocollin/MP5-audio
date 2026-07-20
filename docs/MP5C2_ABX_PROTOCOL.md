# MP5-C2 ABX listening protocol (Phase 3)

Human listening sign-off before treating MP5-C2 as no audible hiss.

## Prepare

1. Export the same source as MP5-L (reference) and MP5-C2 (candidate) via Converter.
2. Confirm candidate path: `pnpm audio:inspect-c2 path/to/candidate.mp5`
   Expect codecId=5, magic 0x43 0x34, mix with F_sr (not only legacy C).
3. Build ABX set:

```bash
pnpm audio:abx-c2 -- --ref ref.mp5l.mp5 --cand cand.mp5c2.mp5 --out benchmarks/listening/abx-c2 --trials 16
```

## Listen

- Headphones, level-matched WAVs in the out dir (A_, B_, trial_XX_X.wav).
- Do not open key.json until finished.
- Prefer sparse/bright/HF, vocals, cymbals, and the original reporter track.
- Fill answers.json from answers.template.json.

## Score

```bash
pnpm audio:abx-c2-score -- --dir benchmarks/listening/abx-c2
```

Pass = correct guesses below the binomial threshold in protocol.json (alpha approx 0.05).
Fail = do not claim transparency; keep investigating loud path / CORR.

## Honesty

No claims vs MP3/AAC/Opus/FLAC/WAV. MP5-L remains the default export.
