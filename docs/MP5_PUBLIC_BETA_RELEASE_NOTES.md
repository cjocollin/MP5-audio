# MP5 Public Beta release notes

**Current release:** MP5 Audio **v0.16.2-beta**  
**Hosted demo:** https://mp5-audio.vercel.app  
**Last updated:** 2026-05-22

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
