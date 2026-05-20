# Current MP5 status (Alpha Demo + Metadata MVP)

**Date:** May 2026 · **Status:** **Demo-ready** (validated) · **Metadata MVP** (general-purpose framing)

**Share / run:** `pnpm demo` · **Checklist:** [`docs/MP5_ALPHA_RELEASE_CHECKLIST.md`](MP5_ALPHA_RELEASE_CHECKLIST.md) · **Verify:** `pnpm alpha:check`

## Codec policy

| Codec | Role |
|-------|------|
| **MP5-L v3** | **Default / recommended** — lossless, bit-exact, ~0.95× PCM on ORIGAMI reference |
| **PCM** | **Reference / debug** — uncompressed; fallback when WASM unavailable |
| **MP5-H** | **Hybrid** — MP5-C base + lossless CORR; **clean when CORR is applied**; **large** (~1.8× PCM on ORIGAMI); not default |
| **MP5-C** | **Lab-only / experimental** — may hiss on all presets; not for normal playback |

**MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

## Alpha validation (ORIGAMI)

| Gate | Result |
|------|--------|
| Export `ORIGAMI_mp5l_v3_alpha.mp5` | Pass |
| Digital bit-exact (null test) | Pass — see `benchmarks/real-music/ORIGAMI_L_PCM_PARITY.md` |
| E2E browser playback | Pass (via `pnpm alpha:check`) |
| Subjective headphone (MP5-L v3) | Clean; no MP5-C-style hiss |

**Follow-up:** MP5-L vs PCM **playback** parity (same app, matched volume) — optional blind A/B.

## What works in the web app

- **Converter:** FLAC/WAV/MP3/etc. → `.mp5` with **MP5-L v3** default (recommended)
- **Metadata export (MVP):** track info, cover, lyrics, optional **content guidance** (grouped: content notices, sensitive themes, listener comfort) — **never auto-generated**
- **Content guidance source:** manual tags export as **user-provided** (`warningSource: user`)
- **Metadata editor:** music-first layout; **Specialized app metadata** with profile selector (Haven / Recovery last; fields only when selected; collapsed by default)
- **Export preview:** detected vs edited vs embedded; empty fields skipped
- **Converter polish:** numbered flow steps, export progress labels, post-export summary, safe filenames (`Artist - Title.mp5`), **Open in Player** / **Add to playlist**
- **Compatibility pass:** synthetic WAV/MP5 fixtures, `pnpm compatibility:check`, [`MP5_COMPATIBILITY_REPORT.md`](MP5_COMPATIBILITY_REPORT.md), supported-sources UI
- **Visual polish / first-run:** welcome onboarding, in-app demo fixture loader (`/fixtures/demo_mp5l_v3_tone.mp5`), codec helper, empty states, responsive layout, focus rings
- **Two-step convert:** load file → review/edit → **Export MP5** button
- **Player import feedback:** drop summary (added / skipped / unreadable with calm reasons)
- **Player:** MP5-L v2/v3, PCM (reference), MP5-H (hybrid + CORR), MP5-C (lab)
- **Player library (MVP):** multi-file playlist (drop append), search, queue controls, auto-advance, repeat (off/all/one), shuffle, decode cache (3 tracks), session metadata persistence
- **Now playing:** large cover, title/artist/album, codec and content guidance badges, mood/vibe chips
- **Metadata panel:** track info, cover, lyrics, content guidance, mood/vibe, waveform stats, format — with calm empty states
- **Format panel:** Codec, encoder version, bit-exact (MP5-L), decode path, hybrid/CORR for MP5-H
- **Demo fixtures:** synthetic tones in `test-fixtures/` (no copyrighted audio)

See [`docs/MP5_METADATA_SPEC.md`](MP5_METADATA_SPEC.md).

## Known limitations

- MP5 does **not** claim to beat MP3, AAC, Opus, or FLAC
- MP5-L v3 does not meet stretch goal ≤0.80× PCM (currently ~0.945× on ORIGAMI)
- MP5-L does not beat FLAC on reference material
- MP5-C: audible hiss — see `docs/MP5C_BLOCKER.md`
- MP5-H: large files; base-only without CORR may hiss
- Browser decode is CPU-bound (WASM)
- Player: no drag-reorder; playlist file handles are not restored after full page reload (session metadata only)
- Browser downloads cannot overwrite existing files predictably; use export summary **Download again** or variant filenames
- **Open in Player** uses in-memory `File` from the last export in this session only (not persisted across reload)

## Metadata limitations

- MP5 is general-purpose audio — content guidance and specialized metadata are optional; normal playback never depends on them
- Haven / Recovery is one optional profile, not the format identity
- Custom app tags profile is documented but postponed (no APPT chunk in MVP converter)
- No AI tagging or auto content guidance
- Mood/vibe: comma-separated + suggestion chips
- Synced lyrics editor not in converter UI
- Lyrics extraction depends on source tags (FFmpeg path)
- Cover art limited to 2 MiB; JSON chunks to 64 KiB
- Metadata is not cryptographically signed or verified

## Intentionally postponed

- MP5-C / MP5-H optimization
- Further MP5-L compression tuning
- AI-generated metadata pipelines
- Moonshot / advanced UI chunks
- ~~Mobile/PWA packaging polish~~ → **PWA install MVP** — see [`MP5_INSTALL_GUIDE.md`](MP5_INSTALL_GUIDE.md)

## Cross-platform packaging (Alpha MVP)

| Target | Status |
|--------|--------|
| **Web / PWA** | **Primary** — manifest, icons, service worker; install on HTTPS/localhost |
| **Desktop (Tauri)** | Scaffold — `tauri.conf.json`, `.mp5` association; no native build wired |
| **Mobile (Capacitor)** | Config only — `capacitor.config.ts`; no `ios/` / `android/` in repo |

See [`MP5_INSTALL_GUIDE.md`](MP5_INSTALL_GUIDE.md) · checks: `pnpm pwa:check`, `pnpm desktop:check`, `pnpm mobile:check`

## Web demo deployment (Alpha)

| Item | Status |
|------|--------|
| **Production build** | `pnpm build` → `apps/web/dist` |
| **Deploy guide** | [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md) |
| **Vercel / Netlify** | `vercel.json`, `netlify.toml` at repo root |
| **Local prod preview** | `pnpm demo:prod` or `pnpm preview` |
| **Dist validation** | `pnpm deploy:check` |

Deploy checklist: `alpha:check` → `build` → `deploy:check` → `demo:prod` → browser smoke.

**Validated hosted demo (Vercel):** https://dist-livid-two-82.vercel.app — see [`MP5_HOSTED_DEMO.md`](MP5_HOSTED_DEMO.md).

## Commands

```bash
pnpm install
pnpm wasm:build
pnpm demo                 # setup checks + dev server
pnpm alpha:check          # full demo-ready gate (recommended before handoff)
pnpm build                # production web dist (PWA)
pnpm pwa:check            # manifest + icons
node scripts/validate-metadata-demo.mjs  # metadata chunk roundtrip validation
pnpm alpha:origami-smoke  # optional; needs ORIGAMI FLAC on Desktop
pnpm alpha:origami-parity
```
