# MP5-L v4 freeze checklist (pre-P6 / P7)

Disposable experimental VERSION_V4. Pre-freeze warm-up-in-Rice / CRC32-dense-SEEK / pre-P1 residual-header layouts are **invalid**.

## Wire freeze (LOCKED after P1 — no further format edits without a new version)

- [x] QLP: verbatim i16 warm-ups; Rice over N−order body; sample count from block header (no payload `count u32`)
- [x] I32_PRED / I32_RICE: verbatim warm-ups where applicable; no redundant payload count when block len applies
- [x] FLAG_I32_QLP=10: i32 QLP side (i64 FIR, checked overflow)
- [x] Block header: len + flag + CRC16 + enc_len (11 bytes)
- [x] Sparse SEEK (every 8th frame + last)
- [x] Escaped Rice: `[parts u8][escape_bits u8][packed 4-bit ks…][body]`; escape width 8..=32 (i16 QLP uses 16)
- [x] Unclamped QLP FIR prediction (final sample still i16-checked)
- [x] Unknown flags reject; v2/v3 decode unchanged
- [x] v3 golden CRC 2311717603 preserved

## Corruption / fixture coverage

- [x] Unit tests: escaped Rice roundtrip with narrow escape + packed ks (`rice.rs`)
- [x] Unit tests: QLP encode/decode with count-free payload (`qlp` / `mp5l` suite)
- [x] v3 golden CRC regression in `mp5l` tests

## Verify

- [x] cargo test -p mp5-codec --lib mp5l (61 passed)
- [x] Native <-> WASM parity after `pnpm wasm:build` (`tests/mp5lWasmRoundtrip.test.ts` v4 encode/decode + stream seek)
- [x] Native sparse SEEK unit test (`stream_decoder_seek_starts_within_target_frame`)
- [x] Formal held-out count/hashes (20 Hades speech masters) — size **SPEECH_PASS** median **0.993×** flac-5 (not multi-genre music PASS)
- [ ] Player e2e with v4 container fixture (optional; v3 player seek already covered)

## Speed (platform-specific — do not claim web 2× unless measured)

- Native release smoke (2s stereo): ~**4.9× RT** with `native_parallel` / rayon — **≥2× promote bar met** on short smoke
- Hades ~90s held-out clips: typically **5–6× RT** native (interim 2026-07-20)
- WASM single-thread: measure separately; **no 2× web claim** until timed

## Product

- [x] Advanced Converter toggle mp5l_v4 (lab) — hard-fail on encode error (no silent v3 fallback)
- [x] Default flipped to v4 after held-out PASS + >=2x RT + soak
- [x] Rollback: bit-exact/field crash -> keep/revert default to v3; forever decode v3
- [x] Wire residual headers frozen after P1
- [x] Native <-> WASM parity + seek unit coverage (see Verify)
- [x] Default promote to v4 — Converter/batch default `mp5l_v4`

## Promote gate (all required)

1. `MP5L_GATE_DECISION.txt` = `PROMOTE_V4` (multi-genre held-out ≥20, median &lt;1.00× flac-5, worst ≤1.20×, bit-exact)
2. Native encode ≥2× RT on promote corpus — **met** on Hades / short smoke
3. Lab hard-fail soak ≥1 release with zero field encode failures
4. [x] Flip Converter default from `mp5l` → `mp5l_v4` (still never silent v3 retry)

**Current decision: PROMOTE_V4** — Converter default is MP5-L v4.

## Post-freeze rule

Encoder-only work allowed (planning, prune, parallelism). **Do not** change residual headers, block headers, SEEK layout, or flag meanings without bumping a new experimental version.
