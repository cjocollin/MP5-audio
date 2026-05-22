# MP5 Alpha release notes

## v0.10.6-alpha — Large-file lazy ingest (May 2026)

**Version:** MP5 Audio **v0.10.6-alpha**

### Added

- **Lazy blob chunk index** for files ≥48 MiB — scan via `File.slice`, no full-file `arrayBuffer()` in playlist state.
- **On-demand payloads:** AUDI for full mix; STDF fragments per selected stem only.
- **Staged ingest UI:** Scanning chunks → Preparing full mix → Loading optional metadata → Integrity pending.
- **Diagnostics:** ingest mode, chunk/STDF counts, loaded MB, timing (Settings → Diagnostics).

### Unchanged

- Codec policy, 64 MiB chunk cap, STDF v1 wire format, STDA v1, worker stem decode, `audio_verified` integrity rules.

---

## v0.10.5-alpha — Large-file playback + STDF CRC + VISU hotfix (May 2026)

**Version:** MP5 Audio **v0.10.5-alpha**

### Fixed

- **STDF false CRC mismatch** on worker stem solo/prepare (missing `payloadCrc32` on worker wire; buffer detach risk).
- **VISU visible themes** when file has metadata but no hex colors (style presets + stronger Now Playing chrome).
- **Large file ingest:** yielding `parseMp5Async` (≥ 48 MiB), staged status labels, cached `rawBuffer`, skip re-parse on playback, HASH/FING deferred until after decode.

### Unchanged

- Codec policy, 64 MiB cap, lazy/selected stems, worker stem decode path.

---

## v0.10.4-alpha — Worker-based stem decoding hotfix (May 2026)

**Version:** MP5 Audio **v0.10.4-alpha**

### Added

- **Web Worker** for heavy stem preparation (STDF reconstruct + MP5-L WASM decode).
- **Per-stem transferable payloads** — only the selected stem’s fragments are posted to the worker (not a full-file copy per stem).
- **Progress UI** — phases (loading fragments / reconstructing / decoding), percent, cancel.
- **Worker diagnostics** in Stems panel; calm **fallback** to main-thread decode if Worker/WASM unavailable.
- Profile notes: [`MP5_STEM_WORKER_PROFILE.md`](MP5_STEM_WORKER_PROFILE.md).

### Unchanged

- Lazy/selected stem behavior, full mix on main path, karaoke subset rules, STDF/STDA v1, codec policy, 64 MiB cap, no AI separation.

---

## v0.10.3-alpha — Large stem playback / mixer performance (May 2026)

**Version:** MP5 Audio **v0.10.3-alpha**

### Fixed

- **Player no longer freezes** on large STDF stem files (e.g. 10 stems / 200+ MB embedded data).
- **Lazy stem parsing** — stem frames are not all reconstructed on file open.
- **Adaptive Stems panel** — full mix always ready; solo, prepare selected, progress + cancel.
- **Karaoke** — instrumental-only decode when available; otherwise progressive non-vocal stems.
- **Synced lyrics** — active line follows Web Audio playback clock (~15 fps UI).

### Unchanged

- STDF/STDA v1 storage (v0.10.2), codec policy, 64 MiB chunk cap, no AI stem separation.

---

## v0.10.2-alpha — Large embedded stems hotfix (May 2026)

**Version:** MP5 Audio **v0.10.2-alpha** (no version bump beyond this milestone)

### Fixed

- **Large stem exports** no longer fail with `Chunk payload exceeds 67108864` when many embedded stems (e.g. 10× ~35 MB) plus rich metadata would overflow a single **STDA** chunk.
- **Segmented STDF v1** storage: large embedded stem sets are split into multiple **STDF** fragments (~12 MiB each), each under the container **64 MiB** per-chunk cap (unchanged).
- **STDA v1** unchanged for small stem sets (combined stem data under ~48 MiB safe budget).
- **STEM** manifest reports `storageMode: "stda-v1" | "stdf-v1"` and per-stem `fragmentCount` when segmented.
- **`pnpm inspect:mp5`** reports stem storage mode, fragment count, and stem data sizes.
- **HASH** integrity entries include each **STDF** fragment.

### Also in v0.10.x (prior patches)

- **v0.10.1-alpha:** stem import single file picker; pre-import RAM warnings (not hard block); sequential normalize for large batches.
- **v0.10.0-alpha:** beta readiness docs, `pnpm beta:check`, golden fixtures, centralized user-facing errors.

### Unchanged (this milestone)

- Codec policy: **MP5-L v3** default · **MP5-C** lab-only · **MP5-H** hybrid/large/not default · **PCM** reference/debug.
- No new product features; no codec work; **64 MiB** chunk limit not raised.

### Verify

```bash
pnpm alpha:check    # or pnpm beta:check
pnpm inspect:mp5 <file>    # shows stdf-v1 + STDF×N when segmented
pnpm validate:mp5 <file> --profile rich
```

Hosted demo: **https://mp5-audio.vercel.app** — UI badge **MP5 Alpha · v0.10.2-alpha**.

---

## Milestone: MP5 Alpha Release Package

The project is **validated**, **demo-ready**, and packaged for sharing:

- **One-command demo:** `pnpm demo` (setup checks + dev server)
- **Release checklist:** [`docs/MP5_ALPHA_RELEASE_CHECKLIST.md`](MP5_ALPHA_RELEASE_CHECKLIST.md)
- **In-app:** About + Demo tabs, global WASM setup banner
- Demo guide: [`docs/MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md)
- Verification gate: **`pnpm alpha:check`**
- Synthetic fixtures only in `test-fixtures/` (no copyrighted songs in repo)

---

## Codec policy

| Codec | Role |
|-------|------|
| **MP5-L v3** | **Default / recommended** — lossless, bit-exact, modest compression |
| **PCM** | **Reference / debug** — uncompressed fallback when WASM unavailable |
| **MP5-H** | **Hybrid** — MP5-C base + lossless CORR; **clean when CORR is applied**; **large**; not default |
| **MP5-C** | **Lab-only / experimental** — may hiss on all presets; not for normal listening |

**MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

---

## Status: validated

**MP5 Alpha is validated** on the ORIGAMI reference track (`- ORIGAMI!.flac` → `ORIGAMI_mp5l_v3_alpha.mp5`).

| Check | Result |
|-------|--------|
| Digital bit-exact (FLAC PCM vs MP5-L decode) | Pass — max diff 0, null test silent |
| Automated tests | `pnpm alpha:check` |
| Subjective headphone pass (MP5-L v3) | Clean — no obvious MP5-C-style hiss |
| Default / recommended export | **MP5-L v3** |

### Follow-up (post-Alpha)

- [ ] **MP5-L vs PCM playback parity** — same browser player, matched volume, blind A/B

See `benchmarks/real-music/ORIGAMI_L_PCM_PARITY.md`.

---

## What works

- **Converter:** FLAC/WAV/MP3/etc. → `.mp5` with **MP5-L v3** default; auto-download on drop
- **Player:** MP5-L v2/v3, PCM (reference), MP5-H (hybrid + CORR), MP5-C (lab)
- **Format panel:** Codec, encoder version, bit-exact line (MP5-L), decode path
- **Demo fixtures:** `demo_mp5l_v3_tone.mp5`, `demo_pcm_reference_tone.mp5`, `demo_mp5c_lab_tone.mp5`
- **WASM round-trip tests** and ORIGAMI benchmark tooling

## What is experimental

| Codec | Notes |
|-------|--------|
| **MP5-C** | Lab-only — may hiss; not for normal playback |
| **MP5-H** | Hybrid — clean with CORR; **~2× PCM** on ORIGAMI; not default |
| **PCM** | Reference / debug only |

## What is postponed

- MP5-C / MP5-H optimization and further MP5-L compression tuning
- MP5-L stretch goal ≤0.80× PCM (currently ~0.945× on ORIGAMI)
- Batch converter UI, shuffle/repeat, mobile/PWA polish
- Moonshot / advanced optional chunks

## Known limitations

- MP5 does **not** claim to beat MP3, AAC, Opus, or FLAC
- MP5-L does **not** beat FLAC on reference material
- MP5-C may hiss — lab/research only
- MP5-H files are much larger than MP5-L
- Browser encode/decode is CPU-bound (WASM)
- Lab tab and some optional chunks are stubs

## Next roadmap

See [`docs/MP5_ROADMAP.md`](MP5_ROADMAP.md):

1. Playback parity A/B in one browser session
2. Optional converter queue UI
3. v0.2 optional metadata display (LYRC, MOOD, …)
4. Further MP5-L compression research (no product promises)

---

## Default export: MP5-L v3

- **Recommended** for listening-quality exports
- **Lossless** and **bit-exact** (decoded PCM matches source)
- Modest compression (~5% smaller than raw PCM on ORIGAMI)
- Bitstream: `0x4c 0x03` (v3)

## How to demo

```bash
pnpm install
pnpm wasm:build
pnpm dev
pnpm alpha:check   # run before handoff
```

See [`docs/MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md).

## Upgrade notes

- New exports use MP5-L **v3** bitstream
- **v2** MP5-L (raw PCM blocks) still decodes
- Re-export old files for best compression
