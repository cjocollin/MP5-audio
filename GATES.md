# Gates: MP5-C v6 ABR 128 fidelity closeout

Scope: Improve CodecId 6 encoder quality at ABR 128 on the dev corpus without decoder, compatibility, determinism, rate, or higher-rate regressions.

- [x] G1: The registered corpus is intact and held-out material remains sealed from tuning.
  CHECK: "C:\Users\colli\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tools/audio-lab/corpus.mjs verify
  EXPECT: /"ok":\s*true/
  EVIDENCE: verified 60; missing 0; changed 0; extra 0; dev 20; held-out not decoded or used for tuning

- [x] G2: The final ABR 128 reference measurement reaches full SNR >= 20.5 dB, quiet-dip error <= -47 dBFS, and its NMR screen passes.
  CHECK: powershell.exe -NoProfile -Command "$r = Get-Content -Raw '.tmp-analysis/abr128-final-rev7-summary.json' | ConvertFrom-Json; if ($r.fullSnrDb -ge 20.5 -and $r.quietDipErrorDbfs -le -47 -and $r.nmrPass) { 'ABR128_QUALITY_PASS' }"
  EXPECT: ABR128_QUALITY_PASS
  EVIDENCE: shipping revision-7 WASM: 20.597858 dB SNR; -50.546047 dBFS dip; 127.973165 kbps. Permanent Rust and WASM NMR reject screens pass; full-reference max/mean NMR remain informational and are disclosed in the JSON.

- [x] G3: Dev-corpus tuning improves the calibrated ABR 128 quality objective without consuming held-out rows.
  CHECK: powershell.exe -NoProfile -Command "$r = Get-Content -Raw '.tmp-analysis/abr128-dev-calibration.json' | ConvertFrom-Json; if ($r.heldOutUsed -eq $false -and $r.improved -eq $true -and $r.nmrPass -eq $true) { 'DEV_CALIBRATION_PASS' }"
  EXPECT: DEV_CALIBRATION_PASS
  EVIDENCE: 11/11 unsealed real-music dev excerpts improved; mean +0.8468 dB, median +0.7411 dB, minimum +0.2990 dB; heldOutUsed=false.

- [x] G4: Encoder output is deterministic after the change.
  CHECK: cargo test -p mp5-codec --release --lib abr_ladder_hits_targets_with_protect_consuming_budget
  EXPECT: test result: ok
  EVIDENCE: final Rust suite and WASM parity suite passed byte-identical re-encode, bounded rate-search, and psycho determinism tests.

- [x] G5: The change is encoder-side only, preserves CodecId 5 and profiles 0-2 decode behavior, and bumps ENCODER_REVISION if bytes change.
  EVIDENCE: ENCODER_REVISION=7; the 205-test package pass includes CodecId 5 unchanged and every-profile decode tests; seven parity fixtures regenerated successfully, including profiles 0-2.

- [x] G6: The full Rust codec test suite passes.
  CHECK: cargo test -p mp5-codec
  EXPECT: test result: ok
  EVIDENCE: `cargo test -p mp5-codec` passed 205/205 (2 ignored), plus the testless c6_ab target and doc tests; manual native parity regeneration completed for all seven fixtures.

- [ ] G7: The full JavaScript/TypeScript test suite passes.
  CHECK: "C:\Users\colli\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" test
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: direct final Vitest run reached 742 passed / 1 skipped with every CodecId 6 and public-claim test green. One unrelated Disney beat debug test remains blocked because it hardcodes the unsigned ffmpeg-static executable; Vitest also reports a worker RPC timeout after the long robustness test. `pnpm test` itself stops before Vitest on the managed runtime's unresolved esbuild/ffmpeg-static build-script policy; no dependency scripts were approved implicitly.

- [x] G8: The dev excerpts and killers pass the LAME/rate/NMR gate at ABR 128.
  CHECK: "C:\Users\colli\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tools/audio-lab/bench-lame.mjs --excerpts dev --killers --rate 128 --rate-mode abr --gate --out .tmp-analysis/bench-lame-128-rev7-final.json
  EXPECT: /gate[^\r\n]*(PASS|pass)|"pass":\s*true/
  EVIDENCE: shipping WASM emits revision 7; 19/19 rows passed. Dev-corpus size ratio vs LAME CBR 128 = 0.992484; all-row ratio = 1.018681; protect-dominated overshoots and quality-ceiling undershoots are disclosed in `.tmp-analysis/bench-lame-128-rev7-final.json`.

- [x] G9: The dev excerpts and killers pass the LAME/rate/NMR gate at ABR 192.
  CHECK: "C:\Users\colli\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tools/audio-lab/bench-lame.mjs --excerpts dev --killers --rate 192 --rate-mode abr --gate --out .tmp-analysis/bench-lame-192-rev7-final.json
  EXPECT: /gate[^\r\n]*(PASS|pass)|"pass":\s*true/
  EVIDENCE: shipping revision-7 WASM passed 19/19 rows; dev-corpus size ratio = 0.992429 and all-row ratio = 0.975549 in `.tmp-analysis/bench-lame-192-rev7-final.json`.

- [x] G10: The dev excerpts and killers pass the LAME/rate/NMR gate at ABR 320.
  CHECK: "C:\Users\colli\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tools/audio-lab/bench-lame.mjs --excerpts dev --killers --rate 320 --rate-mode abr --gate --out .tmp-analysis/bench-lame-320-rev7-final.json
  EXPECT: /gate[^\r\n]*(PASS|pass)|"pass":\s*true/
  EVIDENCE: shipping revision-7 WASM passed 19/19 rows; dev-corpus size ratio = 0.992418 and all-row ratio = 0.949946 in `.tmp-analysis/bench-lame-320-rev7-final.json`.

- [x] G11: Listening-check files are generated from the final encoder and handed to the user with exact source/decode paths.
  EVIDENCE: source `.tmp-analysis/src48.wav`; shipping revision-7 WASM decode `.tmp-analysis/mp5c6-rev7-final-abr128-listen.wav`; encoded stream `.tmp-analysis/mp5c6-rev7-final-abr128.c6stream`.

## Audit gates: current encoder revision 6

Scope: Update the stale revision-5 audit prompt, then perform a read-only audit of the current revision-6 encoder, evidence, compatibility, native/WASM parity, and public claims.

- [x] A1: The revised audit prompt reflects revision 6, the measured matched-rate results, the dev-corpus calibration, and every still-open validation gate.
  CHECK: powershell.exe -NoProfile -Command "$p = Get-Content -Raw '.tmp-analysis/mp5c6-rev6-audit-prompt.md'; if ($p -match 'encoder revision 6' -and $p -match '20\.57' -and $p -match 'WASM' -and $p -match 'still open') { 'AUDIT_PROMPT_CURRENT' }"
  EXPECT: AUDIT_PROMPT_CURRENT
  EVIDENCE: `.tmp-analysis/mp5c6-rev6-audit-prompt.md` passes the current-state check and explicitly separates native revision-6 evidence from open browser/WASM validation.

- [x] A2: The scalefactor path is traced from psycho/band steps through snap, quantize, pack, decode, and compatibility profiles, with any scale or rounding defect recorded.
  EVIDENCE: valid encoder output uses reconstructed snapped steps consistently; malformed band counts and raw non-finite/negative profile-0 steps are not rejected before dequantization (`mod.rs:629-645`, `973-1017`).

- [x] A3: Window geometry, transient planning, width-normalized tonality, masking caps, temporal behavior, silence, short input, and consecutive attacks are audited against code and tests.
  EVIDENCE: TDAC transition tests pass; joint planner receives squared energy and squares it again (`mod.rs:1558`, `windows.rs:170`), and SHORT→STOP temporal elapsed time saturates to zero (`mod.rs:1528,1632`).

- [x] A4: Joint-stereo mode choice, guards, bitmap overhead, short-burst hold, per-channel budget share, and rated spectral tilt are audited for double-counting and starvation.
  EVIDENCE: isolated per-band coefficient records are only a surrogate for whole-vector cost (`mod.rs:1285-1290`); the named channel-balance regression uses dual-mono input and cannot detect side-channel starvation (`mp5c6.rs:1324,1462`).

- [x] A5: ABR/CBR bisection, reservoir drift, protect-first budgeting, the ABR-128 protect/window policy, and pathological starvation cases are audited against implementation and tests.
  EVIDENCE: protect prefix/CRC bytes are subtracted twice (`mp5c6.rs:546,562-563`); equal-byte bisection plateaus retain a coarser candidate (`mod.rs:707-719`); `c6_ab` does not select shipping ABR-128 policy from `C6_ABR` alone.

- [x] A6: Decoder compatibility, CodecId 5 isolation, deterministic output, spec/code/test coherence, committed WASM revision, and About-page claims are checked without treating blocked gates as passes.
  EVIDENCE: release lib 201/0/2; CodecId 5 has no source diff; direct current-package WASM encode writes revision 5; historical benchmark and profile fixtures do not establish current-build/history claims; About copy is explicitly single-track/native/pending-WASM.

- [x] A7: Focused runnable checks pass, or every failure is attributed with exact evidence and kept open.
  EVIDENCE: release library passed 201/201 with 2 ignored; focused About/public tests passed 40/40; WASM parity ran 2/3 and the failing Node Buffer-view construction is pinned to `tests/mp5c6NativeWasmParity.test.ts:97-101`; G6-G10 remain open.

- [x] A8: The final report contains a copyable revised prompt, severity-ranked findings with file/line evidence, unsupported-claim corrections, and prioritized improvement opportunities.
  EVIDENCE: `.tmp-analysis/mp5c6-rev6-audit-report.md` contains P1-P3 findings, no-finding checks, claim matrix, validation ledger, and ranked encoder-side opportunities. No codec implementation was changed by the audit.

## P1 remediation gates: encoder revision 7

Scope: Implement only the five approved P1 remediations: decoder allocation safety, protect byte accounting, joint transient energy semantics with dev-only calibration, asymmetric channel-balance coverage, and truthful native/WASM revision parity.

- [x] F1: Every MP5-C3 coefficient record rejects a declared count that differs from the expected transform size before allocating or Rice-decoding, and CodecId 6 decode does not reserve from an untrusted header frame count.
  CHECK: cargo test -p mp5-codec --release --lib mp5c3::pack::tests
  EXPECT: test result: ok
  EVIDENCE: all coefficient modes validate the transform count before allocation/Rice decode; fixed-window decode preflights exact record coverage; CodecId 6 pre-sums unit frames and grows output only after unit validation. Focused tests and the 205-test package suite pass.

- [x] F2: Protect payload bytes and common unit framing are each charged exactly once under rate control, with a focused byte-ledger regression test.
  CHECK: cargo test -p mp5-codec --release --lib protect_budget_charges_framing_once
  EXPECT: test result: ok
  EVIDENCE: `mdct_pool_for_target` subtracts header/unit framing once and protect payload once; `protect_budget_charges_framing_once` passes.

- [x] F3: Joint window planning consumes channel amplitude rather than already-squared energy, the chosen ABR-128 threshold is selected on unsealed dev material only, and transient/NMR checks do not regress.
  EVIDENCE: joint planning now supplies `hypot(L,R)`, so the planner's square yields L2+R2. Bounded dev-only candidates 16/30/31/32/34/64/128/256/512 selected 32x; held-out remained sealed. Permanent ABR-128 pre-echo and NMR screens pass.

- [x] F4: The rated joint-stereo balance regression uses deterministic asymmetric stereo and proves both physical channels retain acceptable, balanced SNR.
  CHECK: cargo test -p mp5-codec --release --lib abr_joint_stereo_keeps_channels_balanced
  EXPECT: test result: ok
  EVIDENCE: asymmetric deterministic fixture measured L 29.65 dB / R 31.12 dB at ABR 192; focused and full-suite tests pass.

- [x] F5: Encoder output changes advance `ENCODER_REVISION` to 7; the browser parity test reads Node Buffer views correctly and asserts the emitted revision. The shipping WASM package must itself emit revision 7 before browser claims advance.
  CHECK: pnpm exec vitest run tests/mp5c6NativeWasmParity.test.ts
  EXPECT: Tests 3 passed
  EVIDENCE: native manifest and shipping WASM emit revision 7; seven native fixtures regenerated; final focused parity/public run passed 13/13 (parity 3/3).

- [x] F6: Native regression suites pass after the remediations, including deterministic re-encode, all profiles, CodecId 5 isolation, window transitions, and the synthetic NMR screens.
  CHECK: cargo test -p mp5-codec --release --lib
  EXPECT: test result: ok
  EVIDENCE: `cargo test -p mp5-codec` passed 205/205 with 2 manual tests ignored.

- [ ] F7: Final native ABR-128 reference and dev-corpus measurements meet the prior revision-6 floors (reference SNR >= 20.5 dB, dip <= -47 dBFS, dev minimum delta non-negative) without using held-out rows.
  EVIDENCE: shipping revision-7 WASM reference passes at 127.973 kbps, 20.597858 dB SNR, and -50.546047 dBFS dip. Dev mean delta vs revision 6 is +0.008262 dB and heldOutUsed=false, but the strict minimum is -0.007366 dB on `ex_sparse_quiet`; exact non-negative remains open. Bounded adjacent threshold checks did not improve it without a material 0.12 dB regression.

- [x] F8: Public numbers and revision labels are changed only after the corresponding revision-7 native/WASM evidence exists; otherwise the revision-6 table and its browser caveat remain intact.
  EVIDENCE: About table now cites shipping browser/WASM rev 7 and the final one-track 128/192/320 measurements; public tests pass 10/10 and the copy retains the single-track/not-broad-claim caveat.
