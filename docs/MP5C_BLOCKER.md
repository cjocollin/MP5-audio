# MP5-C transparency blocker

**Status: BLOCKED for listening.** Headphone validation (2026-05-19): every MP5-C preset (Standard, High, Extreme) has noticeable hiss. PCM fallback and MP5-L are clean.

## Policy (effective now)

| Export | Role |
|--------|------|
| **MP5-L** | **Default / recommended** — lossless, no quant hiss |
| **PCM** | Uncompressed reference |
| **MP5-C** | Experimental only — **do not use for normal listening** |
| **MP5-H** | **Hybrid listening** — MP5-C base + **lossless CORR** restores full quality when CORR is applied. See [MP5H.md](./MP5H.md) and `pnpm bench:mp5h-validation` for size vs MP5-L and default policy. |

Compression tuning and v5.1 band/M/S work are **paused** until MP5-C passes the transparency gate.

## Root cause (verified)

1. **Container and player are fine** — PCM and MP5-L decode clean.
2. **MP5-L path** — raw PCM blocks + CRC; bit-exact round-trip.
3. **MP5-C path** — `i16 → float → scalar quantize → dequantize → i16` on every frame. Quantization noise is **audible as hiss**, especially in quiet passages, reverb tails, and on headphones.
4. **Not a packing bug** — v5 modes round-trip lossless on coefficients; silence decodes as exact zeros.
5. **Not preset-specific** — all MP5-C presets hiss; Extreme is better on metrics but still fails the listening bar.
6. **Full-song SNR is insufficient** — e.g. 36–40 dB full-song SNR can mask ~0–3 dB quiet-passage SNR where hiss is obvious.

### Contributing factors

- Scalar quantization step (even Extreme `0.012`) leaves a noise floor on decaying material.
- Float domain: encode `/32768`, decode `*32767` (asymmetric full-scale).
- Adaptive step scaling helps but does not remove lossy quant on quiet frames.
- Dense i16 coefficients are **lossless for the quant indices** — the loss is in quant/dequant, not unpack.

## Run diagnostics

```bash
pnpm bench:mp5c-blocker      # silence + quiet fixtures + ORIGAMI table
pnpm bench:hiss-investigation
cargo test -p mp5-codec mp5c_silence_decodes_exact
cargo test -p mp5-codec mp5c_transparency_gate_fails_until_redesign
```

Reports:

- `benchmarks/real-music/MP5C_BLOCKER_REPORT.md`
- `benchmarks/real-music/HISS_INVESTIGATION.md`

## Transparency gate (must pass before recommending MP5-C)

- [ ] Silence decodes as silence (bit-exact) — **passes**
- [ ] Quiet passages: no obvious hiss vs MP5-L — **fails**
- [ ] Extreme headphone-clean by ear — **fails (user confirmed)**
- [ ] Worst-window / quiet metrics pass — **fails**
- [ ] Listening sign-off — **fails**

## Redesign directions (future)

Do **not** implement until spec'd; candidates:

- Lossless fallback frames for quiet / reverb-tail (MP5-L payload inside MP5-C)
- Hybrid: use MP5-L blocks when scalar quant would exceed audibility threshold
- Noise-shaped or dithered quant (careful — may not remove hiss perception)
- Near-lossless Extreme only with much finer step (likely poor compression)
- Abandon scalar-per-sample quant for frequency-domain codec

## MP5-H (why it sounds clean)

MP5-H is **not** the same as playing MP5-C alone.

1. **Encode:** `base = MP5-C(original)`, `residual = original − decode(base)`, `CORR = MP5-L(residual)`.
2. **Decode (enhanced):** `output = decode(base) + decode(CORR) = original` (bit-exact when CORR is present).

The AUDI chunk is an MP5-C bitstream (so tools may say “MP5-C”), but playback uses the **CORR** chunk to cancel quantization noise. That is why headphones hear no hiss on MP5-H while MP5-C alone hisses.

**Caveat:** If CORR is missing or `decode_mp5h(..., false)` is used, you only hear the hiss-y MP5-C base.
