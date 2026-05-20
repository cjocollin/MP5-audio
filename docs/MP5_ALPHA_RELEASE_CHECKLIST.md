# MP5 Alpha Release Checklist

Use this before sharing the repo, tagging a release, or demoing to someone new.

## Codec policy (do not misrepresent)

| Codec | Role |
|-------|------|
| **MP5-L v3** | **Default / recommended** — lossless, bit-exact |
| **PCM** | **Reference / debug** only |
| **MP5-H** | **Hybrid** — clean with CORR; **large**; not default |
| **MP5-C** | **Lab-only / experimental** — may hiss |
| **Claims** | MP5 does **not** claim to beat MP3, AAC, Opus, or FLAC |

---

## 1. Install

- [ ] Node.js **20+**
- [ ] Rust toolchain (for `pnpm alpha:check` and optional benchmarks)
- [ ] `pnpm` (project uses `packageManager` in `package.json`)

```bash
pnpm install
```

## 2. Build

```bash
pnpm --filter @mp5/container build
pnpm wasm:build
pnpm fixtures:generate   # optional; included in alpha:check
```

## 3. Verify

```bash
pnpm alpha:check
```

All steps must pass (fixtures, vitest, Rust, fixture validation, Playwright e2e).

## 4. Run locally

**One command (recommended for demos):**

```bash
pnpm demo
```

Checks WASM/container, prints setup gaps if any, starts `pnpm dev` → http://localhost:5173

**Manual:**

```bash
pnpm dev
```

## 5. Pre-demo checklist (5 minutes before)

- [ ] `pnpm alpha:check` passed recently on this machine
- [ ] `pnpm wasm:build` done (Format panel should show MP5-L WASM v3, not PCM-only)
- [ ] Browser tab open to Player; try `test-fixtures/demo_mp5l_v3_tone.mp5`
- [ ] Converter tab shows **MP5-L v3** as default export
- [ ] Volume up; click **Play** after loading a file
- [ ] Read **Demo** tab steps in the app (or `docs/MP5_DEMO_GUIDE.md`)
- [ ] Do **not** claim MP5 beats mainstream codecs or FLAC

## 6. Demo flow (recommended)

1. **About** tab — what MP5 is, honest policy
2. **Demo** tab — five-step walkthrough
3. **Player** — drop `test-fixtures/demo_mp5l_v3_tone.mp5`, show Format panel, play
4. **Converter** — drop your FLAC/WAV, MP5-L v3 export downloads
5. **Player** — open the new `.mp5`, confirm bit-exact / MP5-L v3

Optional: `demo_mp5c_lab_tone.mp5` only to show lab warning (not for listening).

## 7. Known limitations (say out loud)

- Experimental format — not a production codec replacement
- MP5-L ~0.95× PCM on ORIGAMI; does not beat FLAC on reference material
- MP5-C may hiss — lab only
- MP5-H large even when clean with CORR
- Browser encode/decode is WASM/CPU-bound
- Shuffle/repeat and mobile polish not done

## 8. What not to claim

- “Better than MP3 / AAC / Opus / FLAC”
- “Production-ready default codec”
- “MP5-C recommended for listening”
- “Smaller than FLAC” (not demonstrated on reference material)
- “No audible difference from any player” (playback-path A/B still open)

## 9. Repository hygiene (no copyrighted audio)

- [ ] Only synthetic fixtures under `test-fixtures/*.mp5` are committed
- [ ] `*.mp5` elsewhere and `*.flac` are gitignored
- [ ] ORIGAMI and other real music stay **local** (Desktop / your machine only)
- [ ] Benchmark reports may reference ORIGAMI paths but do not ship the song

## 10. Share package contents

Minimum for a handoff:

| Item | Path |
|------|------|
| README | `README.md` |
| Demo guide | `docs/MP5_DEMO_GUIDE.md` |
| This checklist | `docs/MP5_ALPHA_RELEASE_CHECKLIST.md` |
| Release notes | `docs/MP5_ALPHA_RELEASE_NOTES.md` |
| Demo fixtures | `test-fixtures/demo_*.mp5` |
| WASM setup | `docs/WASM_SETUP.md` |

---

**Demo-ready** when: `pnpm alpha:check` passes and `pnpm demo` loads the app with WASM ready (green codec banner in Converter).
