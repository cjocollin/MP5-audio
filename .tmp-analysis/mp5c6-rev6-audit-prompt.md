# Audit request: current MP5-C v6 encoder revision 6 vs MP3

Perform a read-only audit of MP5-C v6 (CodecId 6), an experimental lossy MDCT codec inside the MP5 audio container. Audit the current working tree for correctness defects, unsupported claims, compatibility risks, test gaps, and evidence-backed improvement opportunities. Do not edit code, regenerate public artifacts, tune against held-out material, or implement fixes during the audit.

Treat code and reproducible artifacts as authoritative. Treat measurements as scoped evidence, not perceptual proof. Separate verified facts, inferences, blocked checks, and recommendations.

## 1. Current scope and layout

- `rust/mp5-codec/src/mp5c3/`: MDCT core, windows, psycho allocation, scalefactors, packing, rate-controlled hop selection.
- `rust/mp5-codec/src/mp5c6.rs`: CodecId 6 header, profiles, container units, protect islands, rate modes, reservoir, encoder policy.
- `rust/mp5-codec/src/bin/c6_ab.rs`: native raw encode/decode measurement harness.
- `apps/web/src/wasm/`: browser WASM surface and committed generated package.
- `tools/audio-lab/`: corpus, LAME comparison, rate, NMR, birdie, and error-spectrum tools.
- `docs/MP5C_NEXT_SPEC.md`: normative CodecId 6/profile documentation.
- `.tmp-analysis/abr128-final-summary.json`: final native ABR-128 reference result.
- `.tmp-analysis/abr128-dev-calibration.json`: unsealed dev-excerpt calibration result.
- `GATES.md`: completed, open, and environment-blocked acceptance gates.

The audit must preserve the user's existing dirty working tree and remain encoder-side/read-only.

## 2. Architecture as currently built

- Encoder revision 6; decoder/bitstream syntax is unchanged from the current profiles.
- MDCT uses 2048-sample long frames and 1024-sample hops, with long/start/short/stop TDAC geometry and 512-sample short windows.
- Thirty-two quadratic-frequency bands carry per-band quantization steps.
- Profile 1 stores a log-domain global gain plus Rice-coded zigzag band deltas on a 1.505 dB grid; profile 0 raw-f32 steps remain decodable.
- Profile 2 uses partitioned Rice coefficient coding plus HF zero runs and deterministic bounded parameter search.
- Joint stereo chooses L/R or M/S per band using encoded cost plus anti-phase, predicted-side-SNR, whole-frame, and short-burst stability guards. Rated stereo uses a content-derived channel budget split.
- Protect islands interleave bit-exact MP5-L units for selected quiet, fragile, and decaying-tail passages. Only protect islands are sample-exact; the full file is lossy.
- ABR/CBR uses deterministic bounded step-multiplier search with a byte reservoir. Protect bytes are charged before the MDCT pool.
- The psycho model includes ATH, Bark spreading, tonality, temporal behavior, and legacy-safe caps. Revision 6 width-normalizes peak-energy concentration tonality across unequal band widths.
- Rated-path allocation applies a +1 dB-per-band spectral tilt above band 16 only when a budget reservoir exists.
- Exact stereo ABR 128 applies the revision-6 policy: psycho enabled, protect threshold scale 1.1 instead of the general 1.5, and a 256x window attack ratio instead of the general planner ratio.
- Quiet-frame step floors and noise-fraction behavior remain passage-adaptive.

## 3. Current measured evidence

Reference track: one 48 kHz stereo real-music track, 217.5 seconds. MP3 references are libmp3lame encodes of the same PCM. Metrics are full-stream SNR and error level during the 8.0-8.75 second quiet phrase gap.

Matched-rate native results:

| Target | Measured MP5-C v6 rate | MP3 SNR / dip | MP5-C v6 rev 6 SNR / dip |
|---|---:|---:|---:|
| 128 kbps | 127.95 kbps | 20.4 dB / -46.9 dBFS | 20.57 dB / -50.53 dBFS |
| 192 kbps | 191.91 kbps | 25.7 dB / -52.4 dBFS | 26.03 dB / -60.22 dBFS |
| 320 kbps | 318.81 kbps | 35.7 dB / -72.2 dBFS | 35.71 dB / -73.05 dBFS |

These are single-track objective measurements. They do not establish a general perceptual win over MP3.

ABR-128 dev calibration used 11 unsealed real-music excerpts: 11/11 improved against the saved prior path; mean SNR delta +0.8468 dB, median +0.7411 dB, minimum +0.2990 dB. The calibration artifact records `heldOutUsed=false`. The registered held-out set remains sealed and must not be decoded or used by this audit.

The permanent synthetic NMR reject-screen tests pass. On the full reference track, revision 6 trimmed maximum NMR is 13.3783 dB versus revision 5 at 13.3942 dB, a 0.016 dB non-regression. Neither revision passes the additional absolute 8 dB full-track NMR bar; do not rewrite that as an absolute NMR pass.

## 4. Compatibility and validation state

Verified native evidence:

- `ENCODER_REVISION` is 6.
- Release library tests passed 201/201, with 2 ignored.
- Deterministic ABR re-encode, psycho determinism, CodecId 5 preservation, profile 0-3 decode, native parity-fixture generation, synthetic NMR reject screens, channel balance, and pre-echo tests are present in the passing library suite. Browser/WASM parity is a separate JavaScript gate and must not be inferred from that native pass.
- Parity fixture regeneration passed 1/1.
- Focused About/public-honesty tests pass.

Still open or environment-blocked:

- Full `cargo test -p mp5-codec` is not green end to end because Windows Application Control blocks Cargo from launching the testless `c6_ab` test executable (OS error 4551). The release library suite is green; do not report the full package suite as passed.
- The full JavaScript run is not clean: broad execution recorded 734 passed, 1 skipped, contention/worker timeouts, and an unrelated hard-coded unsigned `ffmpeg-static` launch blocked by Application Control. Focused codec/rate suites pass when rerun serially.
- The raw wasm32 module compiles, but Windows Application Control blocks the cached official `wasm-bindgen.exe`. The committed browser WASM package has not been regenerated and verified as the final revision-6 encoder.
- Therefore the required final `bench-lame.mjs --excerpts dev --killers --rate 128|192|320 --rate-mode abr --gate` runs remain open for the shipping browser encoder.
- The final user listening comparison remains a subjective acceptance step even though the files have been generated and handed off.

## 5. Rejected experiments: do not recommend them without new evidence

- Releasing psycho masking caps under rate pressure: monotonically worse SNR because the current spreading geometry over-claims masking.
- Coarsening side-channel HF: worse; side HF matters on the reference content.
- TPDF quantizer dither at +/-0.5 or +/-1.0 LSB: 1.7-5 dB SNR loss with no artifact-screen win.
- Finer bass steps via tonal floors: no effect; the reported bass birdies were window-planner churn.
- Additional Low/Standard HF caps: nearly free already because of zero-run coding and not a meaningful ABR-128 lever.

## 6. Required audit

1. Trace the scalefactor chain end to end: psycho/band steps, rated tilt, snap grid, quantization, global gain and delta coding, decoder reconstruction, profile compatibility, rounding, clamping, and non-finite handling. Identify any encoder/decoder scale mismatch or unpriced syntax overhead.
2. Audit TDAC/window behavior: long/start/short/stop geometry, normalization, padding, short input, silence, consecutive and boundary attacks, held short bursts, and the exact ABR-128 256x override. Distinguish artifact prevention from SNR optimization.
3. Audit psycho allocation: width-normalized tonality math, ATH/spreading/temporal interactions, legacy cap enforcement, quiet behavior, rated spectral tilt, band-width bias, and whether corpus evidence supports the policy scope.
4. Audit joint stereo: L/R versus M/S cost accounting, bitmap/header overhead, anti-phase veto, side-image guard, whole-frame guard, burst hold, per-channel budget share, and interactions with per-basis step selection.
5. Audit rate control and reservoir: deterministic bisection bounds, convergence, rounding, exact target behavior, long-file drift, CBR versus ABR semantics, protect-first subtraction, zero/negative MDCT budgets, channel allocation, and pathological protect density.
6. Audit compatibility and isolation: profiles 0-3, malformed/mislabeled failure behavior, CodecId 5 byte isolation, encoder-revision semantics, deterministic output, and fixture coverage.
7. Audit evidence and public claims: reconcile source, spec, tests, JSON evidence, About-page table, and committed WASM. Flag every statement that turns single-track SNR into a broad quality claim, calls blocked gates passed, or attributes native rev-6 results to stale browser bytes.
8. Identify prioritized improvement opportunities that do not repeat rejected experiments or require decoder/bitstream changes. Prefer corpus-calibrated encoder-side changes with deterministic bounded behavior and explicit regression gates.

## 7. Required output

- Findings first, ordered P0-P3, each with exact file and line evidence, impact, and the smallest valid remediation. Say explicitly if a requested audit area has no finding.
- A claim matrix listing each material quality/compatibility claim as supported, scoped, blocked, or unsupported.
- A validation ledger separating passed, failed, blocked, and not run checks.
- Improvement opportunities ranked by expected value, evidence strength, implementation risk, and decoder/bitstream impact.
- No claim of audit completion while any audit gate has `pending` evidence.
