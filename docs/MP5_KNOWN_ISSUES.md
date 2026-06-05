# MP5 known issues and limitations (Alpha)

**Version:** MP5 Audio v0.15.0-alpha · **Status:** Experimental Alpha — public Beta readiness pass; not production-ready

This page lists honest limitations for testers, demo hosts, and future Beta planning. See also [`MP5_BETA_READINESS.md`](MP5_BETA_READINESS.md) and [`MP5_COMPATIBILITY_POLICY.md`](MP5_COMPATIBILITY_POLICY.md).

---

## Codec and audio

| Issue | Detail |
|-------|--------|
| **MP5-C hiss** | Lab-only codec may hiss on music material at all presets — not for normal listening or distribution. |
| **MP5-L compression** | ~0.95× PCM on reference material; does **not** meet stretch ≤0.80× goal; **not FLAC-competitive**. |
| **MP5-H file size** | Hybrid + CORR can be ~1.8× PCM or larger; not default. |
| **MP5-H without CORR** | Base hybrid without correction may hiss — CORR chunk required for clean lossless path. |
| **No codec superiority** | MP5 does **not** claim to beat MP3, AAC, Opus, or FLAC. |

---

## Browser app

| Issue | Detail |
|-------|--------|
| **Large first load** | FFmpeg WASM ~31 MB + codec WASM + PWA precache — first visit can take minutes on slow networks. |
| **CPU-bound decode** | WASM playback is heavy; long files may stutter on low-end devices. |
| **Mobile memory** | Long tracks + stem mix + library can exhaust mobile RAM; guardrails warn but do not guarantee safety. |
| **WASM required** | Without `pnpm wasm:build`, only PCM reference mode is available for encode/decode of compressed codecs. |

---

## Local library

| Issue | Detail |
|-------|--------|
| **Per-browser only** | IndexedDB on this device — no sync across phones or desktops. |
| **Quota** | Browser storage limits; very large libraries may fail to save. |
| **Clear site data** | User clearing browser data removes the library. |
| **No cloud backup** | Alpha has no account or server sync. |

---

## Album packages (.mp5p)

| Issue | Detail |
|-------|--------|
| **Experimental** | Manifest (JSON + sidecars) and embedded (self-contained) `.mp5p` — Alpha UX only. |
| **Manual sidecars (manifest)** | Track files must be present at listed paths; missing files show calm warnings. |
| **Embedded size** | Self-contained packages can be very large; save/load uses browser memory and IndexedDB quota. |
| **Lazy embedded load** | Tracks decode on play/select; “Add album to queue” may load tracks in the background over time. |
| **Cover file refs** | External cover image paths may not load in the web player MVP. |
| **No auto-discovery** | Dropping only `.mp5` files does not infer album order without a manifest. |
| **No DRM** | Package integrity hashes are informational — not legal or ownership verification. |

---

## Stems

| Issue | Detail |
|-------|--------|
| **No AI separation** | Users supply stems manually; no vocal remover or auto-alignment. |
| **Large stem prepare time** | STDF files with 200+ MB embedded stems require progressive decode (Web Worker when available); solo/selected only — not instant all-stem mix. |
| **Large file open** | Files ≥48 MiB use **lazy chunk indexing** (no full-file buffer in playlist state). Initial scan is much faster, but **AUDI decode** and **first play** still take time; browser memory limits apply. |
| **Worker fallback** | Some browsers or blocked workers fall back to main-thread stem decode with a warning; full mix still works. |
| **RAM cap** | Preparing many large stems at once may be blocked (~384 MB selected decode cap); full mix always works. |
| **Stem mix alignment** | If live stem insert cannot align to the current transport clock, the UI may ask you to restart stem mix — silent failure is avoided. |
| **Transport overlap (fixed v0.10.9)** | Earlier builds could play full mix and stem mix together after live stem load; v0.10.9 enforces one authority and per-stem source registry. |
| **Normalization helper** | Resample/pad/trim only — not sample-accurate DAW sync. |
| **Third-party players** | Most players will ignore STEM/STDA/STDF and play AUDI only. |

---

## Batch conversion

| Issue | Detail |
|-------|--------|
| **MP5-L only** | No per-file metadata editor, stems, or karaoke in batch mode. |
| **No ZIP download** | “Download all” triggers separate browser downloads. |
| **Tab must stay open** | Closing the tab cancels an active batch queue. |
| **Sequential** | Large queues are slow and memory-heavy. |

---

## Compatibility and ecosystem

| Issue | Detail |
|-------|--------|
| **Alpha compatibility** | Unknown optional chunks are ignored; CLI `inspect:mp5` / `validate:mp5 --profile strict` run full AUDI/PCM/chunk verify when FING/HASH present. |
| **No third-party players** | MP5 is not supported in mainstream music apps. |
| **Corrupt files** | Truncated or invalid containers fail parse — use `pnpm inspect:mp5`. |
| **Rights metadata** | CRDT/LICN/IDEN are **informational only** — no DRM, no legal enforcement. |
| **Fingerprints** | FING/HASH help detect duplicates — not proof of ownership or authenticity. In-file `fileSha256` is computed before FING/HASH are embedded, so whole-file hash in the player often shows **informational** while PCM/AUDI still verify — not corruption. |

---

## What we do not claim

- Production-ready or “final” format status  
- Legal verification of rights or licenses  
- AI-generated lyrics, stems, warnings, or mood tags (manual / source tags only)  
- Recovery-only or wellness-only product positioning  
- Beating mainstream lossy or lossless codecs  

---

## QA / Playwright (Alpha gates)

| Issue | Detail |
|-------|--------|
| **Parallel e2e flake** | Full `pnpm test:e2e` with many workers can starve WASM decode and stem workers; `play-pause` may stay disabled and `current-time` may not advance until load finishes. **`CI=1` runs one worker + one retry**; playback e2e poll seek slider / `current-time` via shared helpers and assert `player-playback-status` instead of fragile Play/Pause timing. |

---

## Reporting issues

Use the GitHub repo for bugs and reproduction steps. Include `pnpm inspect:mp5 <file>` output when reporting file issues.
