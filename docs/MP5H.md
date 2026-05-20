# MP5-H Hybrid codec

MP5-H is a **two-layer** format: a lossy **MP5-C base** plus a **lossless CORR** residual. Enhanced decode restores the original PCM when CORR is present.

## How it works

```text
encode:
  base  = MP5-C(original)
  residual = original − decode(base)
  CORR  = MP5-L(residual)

decode (enhanced):
  output = decode(base) + decode(CORR) ≈ original
```

- **Hiss** comes from scalar quantization in MP5-C. It lives in the base layer only.
- **CORR** stores the quantization error as MP5-L blocks. Summing base + CORR cancels the error.
- **Silence** in the base may decode to exact zeros; CORR carries any correction needed for bit-exact restore.

## Container vs playback

| What you see in the file | Meaning |
|--------------------------|---------|
| `HEAD.codecId = MP5-H` | Hybrid container |
| `AUDI` chunk | MP5-C base bitstream |
| `CORR` chunk | MP5-L correction (required for clean playback) |

The player must **not** label playback as “MP5-C” when enhanced decode is active. Use:

- Container: **MP5-H Hybrid**
- Base layer: **MP5-C** (+ preset)
- Correction: **CORR present** / **CORR missing**
- Decode: **Enhanced / CORR applied** or **Base only**
- Output: **Lossless restored** or **Not restored**

## Missing CORR

If CORR is absent or empty:

- Show: **“MP5-H base only — correction layer missing”**
- Warn: playback may contain MP5-C artifacts/hiss
- Do **not** claim restored quality

## Validation

```bash
pnpm bench:mp5h-validation
```

Report: `benchmarks/real-music/MP5H_VALIDATION.md`

## ORIGAMI validation (2026-05-19)

Full song `- ORIGAMI!.flac` (154.6s, 48 kHz stereo). See `benchmarks/real-music/MP5H_VALIDATION.md`.

| Mode | Size vs PCM | vs MP5-L | Bit-exact | Quiet SNR |
|------|-------------|----------|-----------|-----------|
| MP5-L | 1.00× | 1.00× | yes | 120 dB |
| MP5-C High | 0.97× | 0.97× | no | 2.0 dB |
| MP5-H High + CORR | 1.97× | 1.97× | **yes** | 120 dB |

**Conclusion:** MP5-H with CORR is clean and bit-exact but ~2× larger than MP5-L on this track. **MP5-L stays the default export.** MP5-H is the validated hybrid option when you accept the size tradeoff for MP5-C-like base + guaranteed restore.

## Export policy

See the benchmark **Recommended export default** section. General rules:

| Condition | Default |
|-----------|---------|
| MP5-H clean + smaller than MP5-L | MP5-H recommended hybrid default |
| MP5-H clean but larger than MP5-L | MP5-L default; MP5-H labeled hybrid option |
| MP5-C alone | Lab / research only ([MP5C_BLOCKER.md](./MP5C_BLOCKER.md)) |
| PCM | Reference fallback |

## Related docs

- [MP5C_BLOCKER.md](./MP5C_BLOCKER.md) — why MP5-C alone is blocked
- [MP5C_LIMITATIONS.md](./MP5C_LIMITATIONS.md) — hiss and metrics
- [MP5C_HISS_INVESTIGATION.md](./MP5C_HISS_INVESTIGATION.md) — investigation notes
