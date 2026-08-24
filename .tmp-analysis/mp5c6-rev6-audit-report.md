# MP5-C v6 encoder revision 6 audit

Date: 2026-08-23  
Scope: read-only audit of the current dirty working tree  
Verdict: native revision 6 narrowly beats the supplied LAME references on the one measured track, including at 128 kbps, but the evidence does not support a general “beats MP3” claim. The shipping browser package still emits encoder revision 5, and several correctness and test gaps should be closed before revision 6 is described as the browser encoder.

## Findings

No P0 findings.

### P1 — coefficient records can allocate from untrusted, unbounded counts

Evidence: [pack.rs:173](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/pack.rs:173) reads a `u32` count for the zero record and allocates `vec![0i16; n]` immediately; [pack.rs:195](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/pack.rs:195) passes the Rice record count onward without applying the limit that exists only for partitioned records at [pack.rs:223](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/pack.rs:223). The hop decoder compares the resulting length with the expected coefficient count only after unpacking at [mod.rs:1011](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:1011). The outer decoder also reserves `total_frames * channels` directly from the header at [mp5c6.rs:791](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c6.rs:791).

Impact: a small, valid-CRC malicious stream can request a very large allocation before structural rejection, producing memory exhaustion or process abort. The mutation fuzz tests do not exercise attacker-recomputed CRCs with extreme length fields.

Smallest remediation: pass the expected coefficient count into unpacking and reject every declared count that is not exactly expected before allocation; use checked arithmetic/`try_reserve` for the output capacity and validate aggregate unit frame counts before reserving. Add one valid-CRC maximum-count fixture per legacy record mode.

### P1 — ABR protect framing is charged twice

Evidence: protect accounting adds payload plus prefix and CRC at [mp5c6.rs:546](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c6.rs:546). The common framing calculation then charges prefix and CRC for every staged unit again at [mp5c6.rs:562](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c6.rs:562), and both values are subtracted from the MDCT pool at [mp5c6.rs:563](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c6.rs:563).

Impact: every protect island removes an extra 13 bytes from the lossy allocation. At 128 kbps, where protect islands are deliberately retained, this directly spends quality budget without changing the emitted protect data.

Smallest remediation: make `protect_bytes` count payload only, leaving all unit framing in `framing`. Add an exact byte-ledger test that proves `header + every prefix/CRC + protect payload + MDCT budgets == target bytes` before tolerance-based rate tests.

### P1 — joint-stereo transient detection squares energy twice

Evidence: the joint encoder constructs `L² + R²` samples at [mod.rs:1558](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:1558). The block planner squares each supplied value again when calculating energy at [windows.rs:170](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/windows.rs:170).

Impact: the shipping joint path detects changes in `(L² + R²)²`, unlike the raw-amplitude path exercised by the planner tests. The special 256× ABR-128 threshold therefore does not have the documented energy-ratio meaning and can change attack sensitivity and start/stop churn unpredictably.

Smallest remediation: pass `sqrt(L² + R²)` into the existing amplitude-consuming planner, or explicitly refactor the planner to accept precomputed energy. Recalibrate the attack ratio on unsealed transient excerpts; do not carry 256× forward without remeasurement.

### P1 — browser parity does not establish a revision-6 shipping encoder

Evidence: a direct encode through the current `apps/web/src/wasm/pkg` package writes encoder revision 5, while native source declares revision 6 at [mp5c6.rs:149](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c6.rs:149). The focused parity test currently fails because it constructs an `Int16Array` from the full Node backing buffer at [mp5c6NativeWasmParity.test.ts:97](C:/Users/colli/OneDrive/Documents/MP5/tests/mp5c6NativeWasmParity.test.ts:97), ignoring the Buffer's byte offset and byte length. The encode test beginning at [mp5c6NativeWasmParity.test.ts:116](C:/Users/colli/OneDrive/Documents/MP5/tests/mp5c6NativeWasmParity.test.ts:116) checks per-build determinism and quality equivalence but never asserts the emitted encoder revision.

Impact: a stale revision-5 WASM encoder can satisfy the encode-side test, while the decode comparison fails before it provides parity evidence. Native revision-6 results cannot be attributed to the browser build.

Smallest remediation: construct the PCM view with `buffer`, `byteOffset`, and `byteLength`; assert the header encoder revision from each WASM encode; regenerate the WASM with the approved toolchain and add one revision-6 policy fixture before running the final corpus gates.

### P1 — the channel-balance regression test is dual-mono

Evidence: the stereo fixture generator copies the same quantized signal to all channels at [mp5c6.rs:1324](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c6.rs:1324), and `abr_joint_stereo_keeps_channels_balanced` consumes that fixture at [mp5c6.rs:1462](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c6.rs:1462).

Impact: identical left/right input has a zero side channel. A regression that starves the second coded channel can still reconstruct equal physical channels and pass, so the test does not cover the historical failure it names.

Smallest remediation: use deterministic asymmetric or decorrelated stereo and assert separate physical-channel SNR plus their delta.

### P2 — malformed scalefactor counts and raw non-finite steps are accepted

Evidence: the decoder trusts the band count at [mod.rs:973](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:973). Profile 0 accepts raw `f32` values without finite/positive validation, while dequantization substitutes a `0.001` step for missing bands at [mod.rs:629](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:629) and [mod.rs:642](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:642).

Impact: malformed streams can decode with substituted, negative, or NaN steps instead of failing closed. Valid encoder output is internally aligned; this is a decoder trust-boundary defect, not an encoder/decoder mismatch on valid streams.

Smallest remediation: require the declared count to equal `band_bounds(expected_coefficients).len()` for all profiles and require raw steps to be finite and positive before coefficient unpacking.

### P2 — rate-search plateaus retain the coarser candidate

Evidence: the bounded search updates the best candidate only when its encoded byte count is strictly greater at [mod.rs:707](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:707). A later, finer multiplier producing the same number of bytes is discarded.

Impact: zero-cost fidelity improvements are lost on entropy-coding plateaus.

Smallest remediation: store the multiplier with the candidate and prefer the finer multiplier when byte counts tie. Add one deterministic plateau test.

### P2 — temporal masking decay collapses on SHORT→STOP

Evidence: SHORT→STOP intentionally moves the next window start backward by 128 samples, documented at [windows.rs:13](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/windows.rs:13). Both temporal-time calculations use `p2.saturating_sub(pos)` at [mod.rs:1528](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:1528) and [mod.rs:1632](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:1632), converting that transition to zero elapsed time.

Impact: temporal boost does not decay across this legal transition, so the psycho state follows window start coordinates rather than forward signal time.

Smallest remediation: compute psycho elapsed time from forward unique-sample coverage, independent of the overlapping transform start. Add a forced SHORT→STOP temporal-state test.

### P2 — joint mode selection calls a surrogate “exact coded cost”

Evidence: per-band L/R and M/S choices pack isolated band slices at [mod.rs:1285](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c3/mod.rs:1285), while the final syntax packs whole coefficient vectors and jointly delta-codes scalefactors. The spec nevertheless says the choice uses exact coded cost at [MP5C_NEXT_SPEC.md:207](C:/Users/colli/OneDrive/Documents/MP5/docs/MP5C_NEXT_SPEC.md:207).

Impact: isolated slices omit cross-band Rice partitioning, zero-run behavior, and real scalefactor-delta interactions. The whole-frame guard sums the same surrogates, so it does not prove an actual stream-size win.

Smallest remediation: retain the per-band heuristic, then price the selected mixed vector and the all-L/R fallback through the real whole-vector serializers, including bitmap/side information, and keep the mixed basis only when actual bytes improve.

### P2 — the raw harness does not reproduce shipping ABR-128 policy by default

Evidence: `c6_ab` defaults protect scale to the general 1.5 constant at [c6_ab.rs:57](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/bin/c6_ab.rs:57) and calls `encode_with_options` at [c6_ab.rs:61](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/bin/c6_ab.rs:61). Shipping exact-stereo ABR 128 selects 1.1 and forces its rated policy through `encode_with_rate` at [mp5c6.rs:410](C:/Users/colli/OneDrive/Documents/MP5/rust/mp5-codec/src/mp5c6.rs:410).

Impact: `C6_ABR=128` alone does not reproduce the browser/container encoder policy; an experiment can be labeled ABR-128 revision 6 while measuring a different protect configuration.

Smallest remediation: add a shipping-policy switch that calls `encode_with_rate`, or make it the default when only `C6_ABR` is supplied. Always print and persist the effective psycho, protect, window, joint, and rate policy beside measurements.

### P2 — compatibility fixtures do not preserve a historical revision

Evidence: the working-tree diff replaces the existing profile 0–2 binary fixtures in place while keeping their names. Current tests prove that current encodes decode; they do not retain immutable revision-5-or-earlier bytes as an independent “decode forever” regression set.

Impact: a future incompatible decoder change can be hidden by regenerating both encoder output and fixtures together.

Smallest remediation: keep versioned historical streams immutable, add new revision-6 fixtures under new names, and have fixture generation refuse to overwrite the historical set.

### P2 — specification and evidence labels have drifted from the implementation

Evidence: the spec says psycho is opt-in at [MP5C_NEXT_SPEC.md:111](C:/Users/colli/OneDrive/Documents/MP5/docs/MP5C_NEXT_SPEC.md:111), although shipping exact-stereo ABR 128 forces it; it says joint choice is exact at line 207 despite surrogate pricing; and its “Measured (this build)” block begins at [MP5C_NEXT_SPEC.md:523](C:/Users/colli/OneDrive/Documents/MP5/docs/MP5C_NEXT_SPEC.md:523), while `benchmarks/audio-quality/lame-gate-128-abr.json` records commit `6ed7d65a...` from 2026-07-27 rather than the current revision-6 working tree. The bisection description also says ten iterations/range `2^-9..2^6`, while current code uses six iterations and a maximum multiplier of 512.

Impact: readers cannot reliably distinguish current policy from historical measurements, and an implementation audit against the prose yields false confidence.

Smallest remediation: update the prose to the actual policy and label benchmark blocks with their recorded commit, encoder revision, and WASM hash. Move current revision-6 result JSON into a committed, reproducible artifact before describing it as release evidence.

### P3 — strictness comments overstate range decode and inspection validation

Evidence: `decode_range` does not cross-check all MDCT unit frame counts against the header when untouched units are skipped, and `inspect_unit_mix` records unknown tags instead of applying full decode strictness. Their comments imply parity with full decode validation.

Impact: these utility paths are easier to misuse as validators than their behavior warrants.

Smallest remediation: either implement the missing aggregate checks or narrow the comments and API contract to “best-effort inspection/range decode.”

## Requested areas with no finding

- Valid encoder output has no scalefactor scale mismatch: the encoder snaps to the coded grid and quantizes with the reconstructed step, and the decoder reconstructs the same grid before dequantization. The defect above concerns malformed input validation.
- Long/start/short/stop window shapes and TDAC overlap-add geometry are internally consistent; fresh release-library transition tests passed. The findings concern detector input semantics and temporal timekeeping, not the window coefficients.
- No CodecId 5 source change was found in the current diff, and the release-library isolation tests passed.
- Native deterministic re-encode tests passed. The remaining determinism gap is release evidence for the stale browser build, not observed native nondeterminism.

## Claim matrix

| Claim | Status | Audit conclusion |
|---|---|---|
| Native rev 6 at ABR 128 measured 20.57 dB SNR / -50.53 dBFS dip at 127.95 kbps | Supported, scoped | Reproducible native single-track result in `.tmp-analysis/abr128-final-summary.json`; not general perceptual proof. |
| Native rev 6 matches or beats the supplied LAME result at 128/192/320 on the reference track | Supported, scoped | Yes for the recorded objective figures; the 128 SNR margin is only about 0.17 dB. |
| MP5-C v6 beats MP3 generally | Unsupported | One track, objective metrics, open browser corpus gates, sealed held-out set, and pending listening do not support it. |
| Revision-6 ABR-128 tuning improved all 11 dev excerpts | Supported, scoped | Artifact records 11/11, mean +0.8468 dB, and `heldOutUsed=false`; it compares against the saved prior path, not LAME on all 11 rows. |
| NMR passes | Split | Permanent synthetic reject screens pass and full-track NMR did not regress; the extra absolute 8 dB full-track bar fails for both revisions. |
| The shipping browser encoder is revision 6 | Unsupported today | Direct WASM encode writes revision 5; regeneration and final corpus gates are open. |
| Profiles 0–2 decode forever | Compatibility intent supported; evidence incomplete | Current profiles decode, but historical fixtures were regenerated instead of retained immutably. |
| CodecId 5 bytes are untouched | Supported | No CodecId 5 source diff; native isolation tests pass. |
| Full Rust package tests pass | Blocked, not passed | Release library: 201 passed, 0 failed, 2 ignored. Full package is blocked by Windows Application Control error 4551 on the testless `c6_ab` executable. |
| Full JavaScript tests pass | Not established | Broad run has application-control and worker/contention failures; focused About/public tests pass. |
| About-page comparison is honest | Supported, scoped | It explicitly says native revision 6, one track, not a broad win, and browser/WASM validation pending. |
| The spec benchmark is “this build” | Unsupported | Recorded commit/date and WASM hash are historical rather than current revision-6 evidence. |

## Validation ledger

### Passed

- `cargo test -p mp5-codec --release --lib`: 201 passed, 0 failed, 2 ignored.
- Native encoder revision is 6; native deterministic, profile, CodecId 5 isolation, window-transition, synthetic NMR, and parity-fixture generation tests passed within that suite.
- Revised audit-prompt current-state check.
- Focused About/public-honesty tests: 40/40 passed; focused web typecheck passed.
- Direct WASM probe completed and established that the current package emits revision 5.

### Failed

- `vitest run tests/mp5c6NativeWasmParity.test.ts`: 1 failed, 2 passed. The failing decode-parity assertion expected 32,768 samples but received 12,288 because the test ignores the Node Buffer view bounds.

### Blocked

- Full `cargo test -p mp5-codec`: Windows Application Control error 4551 when Cargo launches the testless `c6_ab` target.
- Full JavaScript suite: unsigned `ffmpeg-static` launch plus worker/contention failures.
- WASM regeneration: Windows Application Control blocks the cached official `wasm-bindgen.exe`/DLL.
- Final browser `bench-lame.mjs` gates at 128, 192, and 320 until revision-6 WASM is built.

### Not run

- Held-out corpus: intentionally sealed and not consumed.
- Final subjective listening verdict: files are prepared, but acceptance belongs to the user.

## Ranked improvement opportunities

| Rank | Opportunity | Expected value | Evidence | Risk | Decoder/bitstream impact |
|---:|---|---|---|---|---|
| 1 | Fix protect framing double-charge | High at 128 where protect density matters | Direct byte-ledger defect | Low | None |
| 2 | Prefer finer bisection result on equal-byte plateaus | Free or near-free quality | Direct search tie defect | Low | None |
| 3 | Correct joint transient input, then corpus-recalibrate attack threshold | Potentially high artifact/bit allocation stability | Direct fourth-power mismatch; prior window churn history | Medium | None |
| 4 | Reprice final joint choice with actual whole-vector syntax | Medium quality/rate efficiency | Current cost omits real cross-band effects | Medium | None |
| 5 | Re-run corpus-calibrated psycho allocation after accounting/window fixes | Potentially high but research-heavy | Revision-6 tonality result is positive across 11 dev excerpts | Medium/high | None |
| 6 | Tune existing Rice partition decisions per band/corpus | Medium, uncertain | Existing syntax carries the parameters | Medium | None if syntax is reused |

Before any further fidelity tuning, close the trust-boundary allocation checks and make the native/WASM revision gate truthful. Do not retry masking-cap release, side-HF coarsening, dither, tonal bass floors, or extra low-rate HF caps without new contrary evidence.
