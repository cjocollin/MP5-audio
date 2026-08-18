# MP5-C (CodecId 6) ABX / MUSHRA listening protocol (Phase 6)

Normative companion to `docs/MP5C_NEXT_SPEC.md` §6. This protocol **replaces**
`docs/MP5C2_ABX_PROTOCOL.md` for all lossy-codec listening (that document
remains valid only for CodecId 5 sample-equality checks — ABX on a bit-exact
codec is meaningless).

Scope discipline (locked):

- **No "beats MP3"** until a specifically qualified bitrate passes this
  protocol with multiple listeners. Interim wording: "experimental lossy
  targeting MP3-class sizes."
- Gates are **per bitrate**: 320 first, then 192, then 128 as a stretch. A
  128 failure MUST NOT block a qualified 320 or 192.
- Every published run reports the **three figures** (coded-path bitrate,
  protected sample %, total size) beside the listening outcome.

## Arms

| Arm | Stimuli | Design | Hypothesis under test |
|-----|---------|--------|------------------------|
| **ABX-320** | C6 ABR 320 vs decoded reference | 16 randomized trials per fixture, X drawn from A or B | Listener cannot identify X better than chance (transparency at 320) |
| **MUSHRA-192** | hidden reference, LAME CBR 320 anchor, LAME CBR 128 anchor, C6 ABR 192 | MUSHRA 0–100 scale | C6 ABR 192 is non-inferior to the LAME CBR 128 anchor |
| **MUSHRA-128** | same, with C6 ABR 128 | MUSHRA 0–100 scale | C6 ABR 128 is non-inferior to the LAME CBR 128 anchor |

## Preregistration (mandatory before listening)

Each experiment is a directory under `benchmarks/listening/<experimentId>/`
containing `protocol.json` (generated, immutable once listening starts):

- experiment id, creation date, git commit, encoder description
- fixture list (dev corpus + killer fixtures; held-out excerpts are added at
  RC time only, under `--allow-held-out` with a recorded reason)
- arm designs, hypotheses, and pass rules (table above)

Retuning after looking at results requires a **new experiment id** (new
`encoder_revision` semantics — see spec §9.1) and a fresh protocol.json.

Generate a set:

```bash
node tools/audio-lab/gen-listening-set.mjs --experiment-id <id> --fixtures both
```

This writes level-matched WAVs (`abx320/`, `mushra192/`, `mushra128/`),
`protocol.json`, and `answers.template.json`. The current preregistered set is
`benchmarks/listening/c6-listen-phase6-r1/` (19 fixtures, git commit recorded
in its protocol.json).

## Listen (human step)

- Headphones, level-matched WAVs. Do not open key/answers until finished.
- ABX: fill `correct` per fixture in `answers.json` (from the template).
- MUSHRA: score each stimulus 0–100 against the hidden reference; note
  artifacts (hiss, pre-echo, stereo collapse, clipping, duration drift).
- Multi-listener: at least 3 listeners for a leave-lab claim; 1 maintainer
  pass is a lab smoke only.

## Score / pass rules

- **ABX-320 pass:** per fixture, correct ≤ binomial critical value at
  α = 0.05 (computed as in `tools/audio-lab/abx-c2.mjs`), and overall.
- **MUSHRA-192 pass:** median C6 score ≥ median LAME-128 anchor on ≥ 80% of
  fixtures; **no** fixture with systematic artifact reports (hiss / pre-echo /
  stereo collapse / clip / duration drift).
- **MUSHRA-128 pass:** same rule. Failure here does not block 320/192.
- Any arm failing → the bitrate stays in lab; copy remains "experimental".

Record outcomes in `results.json` next to `protocol.json` (listener(s), date,
per-fixture scores, aggregate verdicts). Commit the whole experiment
directory.

## Lab-listening-ready checklist (this build)

| Item | Status | Evidence |
|------|--------|----------|
| CodecId 6 wired end-to-end | ✅ | `rust/mp5-codec/src/mp5c6.rs`, WASM exports, lab-gated converter/player |
| PR tests green | ✅ | `cargo test -p mp5-codec` 194 passed; `pnpm test` 100+ files |
| Protect islands bit-exact | ✅ | per-unit sample-equality asserted in Rust + JS tests |
| `%protected` shown | ✅ | `inspect_unit_mix` (Rust/WASM/JS parity) |
| 320 within ~5% of LAME-320 on dev corpus | ✅ | `benchmarks/audio-quality/lame-gate-320-abr.json`: dev ratio 0.992 |
| Rate control ±3% at 320/192/128 | ✅ | ABR 318.9/191.3/127.6 kbps on demanding fixtures |
| Public copy = experimental only | ✅ | `codecDisplay.ts` labels MP5-C "lossy · experimental", lab toggle required |
| Informal A/B on killers | ⏳ **human step — this document + stimuli are ready** |

## Leave-lab (per bitrate) — outstanding, all human-gated

1. Held-out corpus size gates (sealed until RC; `--allow-held-out` + reason).
2. Objective non-inferiority proxies on held-out (SNR/NMR screens as reject
   filters only).
3. This protocol executed with ≥3 listeners per qualifying bitrate.
4. Only then may the UI expose that bitrate outside the lab toggle.
