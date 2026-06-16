# MP5 Public Beta release notes

**Current release:** MP5 Audio **v0.19.0-beta**
**Hosted demo:** https://mp5-audio.vercel.app
**Last updated:** 2026-06-16

---

## What is MP5?

MP5 is an **experimental, browser-based** open-source audio format, container, codec, converter, and player. It packages audio with rich optional metadata (cover art, lyrics, sections, stems, album packages). It is **Public Beta** — not production-ready for archival or legal use.

---

## What works (v0.16.1-beta / v0.16.2-beta)

| Area | Status |
|------|--------|
| **MP5-L v3** | Recommended lossless convert and play |
| **Web player** | Play, pause, seek, volume, playlist, loops |
| **Converter** | WAV, FLAC, MP3, M4A, OGG → MP5-L (FFmpeg WASM) |
| **Metadata** | Cover, lyrics, guidance, VISU themes (Now Playing) |
| **Stems / karaoke** | Experimental stem mix and synced lyrics |
| **Album packages** | Manifest and embedded `.mp5p` (experimental) |
| **Local library** | Browser IndexedDB on this device only |
| **Hosted demos** | Synthetic MP5-L, karaoke, embedded album |

---

## Player / Listening UX (v0.19.0-beta)

- Now Playing shows clearer title, artist, album, cover fallback, codec/profile, source type, album position, current time, duration, remaining time, embedded hydration, integrity, and VISU fallback state.
- Queue and album rows show source/package badges, current row status, thumbnails/fallbacks, durations, and embedded/manifest context without parsing huge embedded packages just for rows.
- Timeline and waveform controls have larger mobile targets, remaining time, disabled/loading states, and a safe seek preview.
- Lyrics/karaoke highlights are more readable with previous/upcoming context and better no-lyrics states. Stems show audible/ready/preparing/muted states more clearly.
- VISU remains contained to the player visual area. MP5-C remains lab-only; MP5-L lossless behavior and MP5P/STDF semantics are unchanged.

## Exporting & packages (v0.18.0-beta)

- **MP5-L v3** is the recommended lossless default for export. **MP5-C** is lab-only and never the default.
- **Manifest `.mp5p`** — small index file plus separate sidecar `.mp5` files; keep them together.
- **Embedded `.mp5p`** — one self-contained file; easiest to share but can be large and memory-heavy.
- A **review step** before package export summarizes mode, tracks, size, cover, and warnings; packages are validated **before and after** export with a clear pass/warning.
- Exports run **locally in your browser** — no upload, no cloud sync, no telemetry. Filenames are sanitized and de-duplicated.
- **Keep your originals backed up.** MP5 does **no rights/legal verification** and makes **no claim** to beat MP3/AAC/Opus/FLAC.

---

## Known limitations

- **Not production-ready** — experimental Public Beta
- **Does not claim to beat** MP3, AAC, Opus, or FLAC
- **No DRM** — rights metadata is informational only; no legal proof
- **No automated stem separation** in the product
- **MP5-C** — lab-only; known hiss on music material
- **MP5-H** — large hybrid mode; not default
- **`.mp5p`** — experimental; large embedded albums can be heavy
- **Browser memory** — long files, many stems, or huge albums may stress mobile
- **First load** — WASM + FFmpeg precache is large (~30+ MB)

See [`MP5_KNOWN_ISSUES.md`](./MP5_KNOWN_ISSUES.md) for detail.

---

## Format policy

| Format | Role |
|--------|------|
| **MP5-L v3** | **Default / recommended** |
| **MP5-C** | **Lab-only** — not for normal listening |
| **MP5-H** | **Large / experimental** — not default |
| **`.mp5p`** | **Experimental** album package |

---

## Privacy and browser-local storage

- Audio you open or convert is processed **in your browser tab**
- Nothing is uploaded automatically; **no telemetry**
- Local library uses **browser storage** on this device only
- Exported `.mp5` / `.mp5p` files are **experimental** — keep originals elsewhere

---

## How to test

1. Open https://mp5-audio.vercel.app
2. Try **Demo guide** paths (MP5-L demo, karaoke, embedded album)
3. Optional: convert your own file with **MP5-L v3** default
4. Optional: real phone spot-check — see [`MP5_MANUAL_QA_CHECKLIST.md`](./MP5_MANUAL_QA_CHECKLIST.md) section L

---

## How to report bugs or give feedback

1. **Settings → Report a bug / Give feedback** (links to GitHub Issues)
2. **Settings → Diagnostics → Copy diagnostics** and paste into the issue (redact filenames if needed)
3. Include: **MP5 version**, **browser/OS**, **file type** (`.mp5` or `.mp5p`), **steps to reproduce**

Templates: Bug report · Beta feedback · MP5 file compatibility · Feature request

**Privacy:** Do not upload copyrighted or private audio unless you have rights and choose to share it.

---

## Suggested GitHub release (draft — tag not created unless maintainer asks)

**Title:** MP5 Audio v0.16.2-beta — Public Beta Hardening

**Body draft:**

### Highlights

- Public Beta feedback path (GitHub Issues + in-app links)
- Issue templates for bugs, Beta feedback, compatibility, and features
- Diagnostics **Copy diagnostics** for testers (version, browser, WASM, last error)
- First-user guidance on landing and Demo guide
- Physical phone QA checklist (section L)
- Public Beta release notes (this document)

### Testing status

- Local gates: `pnpm test`, `test:e2e`, `playback:check`, `alpha:check`, `beta:check`, `build`, `deploy:check`
- Hosted: https://mp5-audio.vercel.app — `hosted:verify`, `test:e2e:hosted` 11/11
- Physical phone spot-check: optional / pending

### Known limitations

Experimental Public Beta. MP5-L recommended; MP5-C lab-only; `.mp5p` experimental. No DRM, no legal proof, no beat-codec claims.

### Report issues

https://github.com/cjocollin/MP5-audio/issues/new/choose

---

## Related docs

- [`CURRENT_MP5_STATUS.md`](./CURRENT_MP5_STATUS.md)
- [`MP5_BETA_READINESS.md`](./MP5_BETA_READINESS.md)
- [`MP5_HOSTED_DEMO.md`](./MP5_HOSTED_DEMO.md)
- [`CHANGELOG.md`](../CHANGELOG.md)
