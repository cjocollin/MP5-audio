# MP5 Audio

An experimental smart audio format, converter, and player.

**Live demo:** https://mp5-audio.vercel.app · **GitHub:** https://github.com/cjocollin/MP5-audio

**Version:** MP5 Audio **v0.10.3-alpha**

MP5 Alpha uses **MP5-L v3** as the recommended lossless mode. **MP5-C** and **MP5-H** are experimental research modes. **MP5 does not claim to beat MP3, AAC, Opus, or FLAC.** No DRM. Rights metadata is informational only.

**Compatibility toolkit:** [`docs/MP5_CHUNK_REGISTRY.md`](docs/MP5_CHUNK_REGISTRY.md) · [`docs/MP5_COMPATIBILITY_POLICY.md`](docs/MP5_COMPATIBILITY_POLICY.md) · `pnpm inspect:mp5 <file>` · `pnpm validate:mp5 <file>`

**Beta readiness:** [`docs/MP5_BETA_READINESS.md`](docs/MP5_BETA_READINESS.md) · [`docs/MP5_KNOWN_ISSUES.md`](docs/MP5_KNOWN_ISSUES.md) · `pnpm beta:check`

---

## What is MP5?

**MP5** (`.mp5`) is a general-purpose experimental smart audio container — music, podcasts, libraries, and apps. It stores audio plus context: metadata, cover art, lyrics, waveform/seek data, optional content guidance, mood/vibe tags, and room for future interactive audio.

| Works now (Alpha) | Experimental | Future |
|-----------------|--------------|--------|
| MP5-L v3 convert & play | MP5-C (may hiss) | Stems / interactive audio |
| Metadata, cover, lyrics | MP5-H (large) | Cloud sync / accounts |
| **Local library** (device-only) | Specialized app profiles | Offline polish |
| Content guidance (optional) | Specialized app profiles | Offline polish |

---

## Codec policy

| Codec | Role |
|-------|------|
| **MP5-L v3** | **Default / recommended** — lossless, bit-exact |
| **PCM** | **Reference / debug** only |
| **MP5-H** | **Hybrid** — clean with CORR; **large**; not default |
| **MP5-C** | **Lab-only** — may **hiss**; not for normal listening |

---

## Screenshots

From the [live Alpha demo](https://mp5-audio.vercel.app) — synthetic demo audio only; no copyrighted album art.

| Player | Converter | Metadata |
|--------|-----------|----------|
| ![MP5 Player — playlist, playback, Format panel](docs/screenshots/Player.png) | ![MP5 Converter — import, encode, export MP5-L v3](docs/screenshots/Converter.png) | ![MP5 Metadata — title, cover, lyrics, optional guidance](docs/screenshots/Metadata.png) |

More captures: [`docs/screenshots/`](docs/screenshots/README.md)

---

## Quick start (local)

```bash
pnpm install
pnpm wasm:build    # required for MP5-L — see docs/WASM_SETUP.md
pnpm demo          # http://localhost:5173
```

**Try the hosted demo:** open https://mp5-audio.vercel.app → **Try the MP5-L demo** → play synthetic tone (no copyrighted music in repo).

**Convert your own audio:** Converter → drop FLAC/WAV/MP3/M4A/OGG → edit metadata → **Export MP5-L v3** → **Open in Player**.

**Batch convert:** Converter → **Batch** → drop multiple sources → **Start batch** (MP5-L v3 only). Progress per file; download individually or **Download all** (separate files, no ZIP). Optional **auto-save to library** with FING duplicate detection. All processing stays in the browser — large batches can be slow; closing the tab cancels work. Per-file metadata editing uses **Single file** mode.

**Stems (v0.8.2):** Import stems **one-by-one or in batch** (WAV/FLAC/MP3/M4A/OGG); filename-based type guessing; **normalize** rate/duration vs the full mix — see [`docs/MP5_STEMS.md`](docs/MP5_STEMS.md).

**Performance (v0.8):** Settings → **Diagnostics** shows queue size, decode cache, library storage, WASM/FFmpeg status, and conversion activity. Calm warnings appear for very large files, long batches, stem RAM limits, and storage pressure. First load downloads WASM + FFmpeg (~31 MB for non-WAV conversion).

**Local library:** **Library** tab → save `.mp5` files on this device (IndexedDB). Search, play, download again, or add to the player queue. Nothing is uploaded to a server; clearing browser data may remove saved files. Large exports can use significant storage.

**Optional stems:** Converter **Stems** section — add WAV/FLAC stems manually (no AI). Full mix stays in AUDI; **STDA** (small) or **STDF** (large embedded sets). Player uses **lazy stem load** — solo or prepare selected stems; karaoke prefers instrumental-only decode. See [`docs/MP5_STEMS.md`](docs/MP5_STEMS.md).

**Synced lyrics / karaoke:** Optional **LYRC** synced lines (`timeMs`) via converter `[mm:ss.xx]` editor; player lyrics panel + karaoke mode (synced lyrics + stems). No AI lyric generation. See [`docs/MP5_METADATA_SPEC.md`](docs/MP5_METADATA_SPEC.md).

**Song sections:** Optional **SECT** / **HOOK** / **HILT** — manual song map, smart navigation, highlight preview/loop in the player (no clip export). See [`docs/MP5_SECTIONS.md`](docs/MP5_SECTIONS.md).

**Visual themes:** Optional **VISU** — per-file accent colors and mood for the player UI (no effect on audio). See [`docs/MP5_VISUAL_THEMES.md`](docs/MP5_VISUAL_THEMES.md).

**Credits & rights:** Optional **CRDT**, **LICN**, and **IDEN** metadata for credits, license hints, and release IDs — informational only (no DRM or enforcement). See [`docs/MP5_CREDITS_RIGHTS.md`](docs/MP5_CREDITS_RIGHTS.md).

**Fingerprints:** Optional **FING** / **HASH** for duplicate detection and local integrity checks — not DRM or legal proof. See [`docs/MP5_FINGERPRINT_INTEGRITY.md`](docs/MP5_FINGERPRINT_INTEGRITY.md).

**Album packages:** Optional **`.mp5p`** manifest (experimental) references sidecar `.mp5` files — not an embedded archive. Import, create, and saved-album playback in the reference app. Single-track `.mp5` remains the core format. See [`docs/MP5_ALBUM_PACKAGE.md`](docs/MP5_ALBUM_PACKAGE.md).

---

## Verification

```bash
pnpm alpha:check          # full Alpha gate
pnpm build
pnpm deploy:check
pnpm vercel:check
```

---

## Deploy

Vercel project **`mp5-audio`** → https://mp5-audio.vercel.app

→ [`docs/MP5_VERCEL_SETUP.md`](docs/MP5_VERCEL_SETUP.md) · [`docs/MP5_DEPLOYMENT_GUIDE.md`](docs/MP5_DEPLOYMENT_GUIDE.md)

---

## Alpha roadmap

- Metadata polish
- Better MP5-L compression
- MP5-C redesign
- Stems / interactive audio research
- Desktop / mobile packaging
- Offline improvements
- Library persistence

---

## Important limitations

- Experimental Alpha — not production-ready
- Large WASM/FFmpeg download on first visit (~30+ MB precache)
- Browser encode/decode is CPU- and memory-intensive
- MP5-C may hiss; MP5-H files are large
- Playlist file handles are not restored after full page reload
- **MP5 does not claim to beat MP3, AAC, Opus, or FLAC**

---

## Project layout

| Path | Purpose |
|------|---------|
| `apps/web/` | Player + converter + public landing |
| `packages/mp5-container/` | `.mp5` parser/writer |
| `rust/mp5-codec/` | MP5-L / MP5-C / MP5-H (WASM) |
| `test-fixtures/` | Synthetic demo tones only |
| `docs/` | Specs, demo guides, deployment |

---

## Docs

- [Public demo copy](docs/MP5_PUBLIC_DEMO_COPY.md)
- [Demo guide](docs/MP5_DEMO_GUIDE.md)
- [Current status](docs/CURRENT_MP5_STATUS.md)
- [Hosted demo](docs/MP5_HOSTED_DEMO.md)
- [Metadata spec](docs/MP5_METADATA_SPEC.md)
- [Roadmap](docs/MP5_ROADMAP.md)

---

## License

MIT — experimental research prototype.
