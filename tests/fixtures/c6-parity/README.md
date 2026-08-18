# c6-parity golden fixtures

Golden fixtures for CodecId 6 syntax families (Phase 7). Every committed
stream must keep decoding forever; `tests/mp5c6NativeWasmParity.test.ts`
verifies bit-identical PCM decode against these hashes on every PR (native ↔
WASM decode parity).

Contents:

- `manifest.json` — per-fixture SHA-256 of the stream and of the decoded PCM
- `p0_transitional.c6stream` — profile 0 (raw f32 steps, transitional lab)
- `p1_coded_sf.c6stream` — profile 1 (coded scalefactors, Phase 4.1)
- `p2_partitioned.c6stream` — profile 2 (partitioned coefficients, Phase 4.2)
- `p3_independent_nowin.c6stream` — profile 3, independent, no window switching
- `p3_default.c6stream` — profile 3 shipping defaults (joint stereo + window switching)
- `p3_full_stack_abr192.c6stream` — profile 3 joint + window + psycho, ABR 192
- `p3_mono_window.c6stream` — profile 3 mono, window switching

Regenerate (native build, after any intentional syntax change — and ONLY then):

```bash
cargo run --release -p mp5-codec --features bench_tools --bin c6_parity
```

Regeneration rewrites the streams and `manifest.json`. If a change alters
these bytes unintentionally, the parity test failing is your freeze alarm.

Rate modes (ABR/CBR/VBR) are encoder-side; the frozen syntax families above
cover the decode surface. Forever-decode of prior CodecId 1/3/5 formats is
covered by `tests/compatibility/` fixtures, not this directory.
