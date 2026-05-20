# MP5 Audio

An experimental smart audio format, converter, and player.

**Live demo:** https://mp5-audio.vercel.app · **GitHub:** https://github.com/cjocollin/MP5-audio

MP5 Alpha uses **MP5-L v3** as the recommended lossless mode. **MP5-C** and **MP5-H** are experimental research modes. **MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

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

**Local library:** **Library** tab → save `.mp5` files on this device (IndexedDB). Search, play, download again, or add to the player queue. Nothing is uploaded to a server; clearing browser data may remove saved files. Large exports can use significant storage.

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
