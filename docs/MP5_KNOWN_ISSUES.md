# MP5 known issues and limitations (Alpha)

**Version:** MP5 Audio v0.10.0-alpha · **Status:** Experimental Alpha — not Beta, not production-ready

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
| **Experimental** | Manifest + sidecar `.mp5` tracks — not a single-file album container. |
| **Manual sidecars** | Track files must be present at listed paths; missing files show warnings. |
| **Cover file refs** | External cover image paths may not load in the web player MVP. |
| **No auto-discovery** | Dropping only `.mp5` files does not infer album order without a manifest. |

---

## Stems

| Issue | Detail |
|-------|--------|
| **No AI separation** | Users supply stems manually; no vocal remover or auto-alignment. |
| **RAM cap** | Stem mix decodes all stems (~120 MB MVP cap); long or many stems may fail. |
| **Normalization helper** | Resample/pad/trim only — not sample-accurate DAW sync. |
| **Third-party players** | Most players will ignore STEM/STDA and play AUDI only. |

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
| **Alpha compatibility** | Unknown optional chunks are ignored; strict HASH verification in CLI is partial. |
| **No third-party players** | MP5 is not supported in mainstream music apps. |
| **Corrupt files** | Truncated or invalid containers fail parse — use `pnpm inspect:mp5`. |
| **Rights metadata** | CRDT/LICN/IDEN are **informational only** — no DRM, no legal enforcement. |
| **Fingerprints** | FING/HASH help detect duplicates — not proof of ownership or authenticity. |

---

## What we do not claim

- Production-ready or “final” format status  
- Legal verification of rights or licenses  
- AI-generated lyrics, stems, warnings, or mood tags (manual / source tags only)  
- Recovery-only or wellness-only product positioning  
- Beating mainstream lossy or lossless codecs  

---

## Reporting issues

Use the GitHub repo for bugs and reproduction steps. Include `pnpm inspect:mp5 <file>` output when reporting file issues.
