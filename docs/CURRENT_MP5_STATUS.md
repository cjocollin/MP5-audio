# Current MP5 status (Alpha Demo + Metadata MVP)

**Date:** May 2026 · **Status:** **Demo-ready** (validated) · **Metadata MVP** (general-purpose framing)

**Live demo:** https://mp5-audio.vercel.app · **GitHub:** https://github.com/cjocollin/MP5-audio

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
- **Batch converter (MVP):** **Batch** tab — multi-file import, queue with per-file status, **MP5-L v3 only**, progress summary, retry failed, download individual/all (no ZIP), optional auto-save to local library with FING duplicate detection; browser-local (no upload)
- **Batch stem import + normalization (v0.8.2-alpha):** import multiple stems at once, filename type guessing, batch summary, bulk normalize/remove; **Normalize stems to match full mix** — resample, pad/trim, optional pad full mix — [`MP5_STEMS.md`](MP5_STEMS.md)
- **Performance / reliability (v0.8.0-alpha):** Settings **Diagnostics** panel; guardrails for large sources, batch queues, library quota, stem RAM; improved cancel/cleanup for single + batch conversion; decode cache stats/clear on queue/library clear; object URL revoke on downloads; FFmpeg load failure messaging
- **Metadata export (MVP):** track info, cover, unsynced/synced lyrics, optional **content guidance** (grouped: content notices, sensitive themes, listener comfort) — **never auto-generated**
- **Content guidance source:** manual tags export as **user-provided** (`warningSource: user`)
- **Metadata editor:** music-first layout; **Specialized app metadata** with profile selector (Haven / Recovery last; fields only when selected; collapsed by default)
- **Export preview:** detected vs edited vs embedded; empty fields skipped
- **Converter polish:** numbered flow steps, export progress labels, post-export summary, safe filenames (`Artist - Title.mp5`), **Open in Player** / **Add to playlist**
- **Compatibility pass:** synthetic WAV/MP5 fixtures, `pnpm compatibility:check`, [`MP5_COMPATIBILITY_REPORT.md`](MP5_COMPATIBILITY_REPORT.md), supported-sources UI
- **Public landing:** hero, codec cards, screenshot gallery (Player / Converter / Metadata), demo flow, honesty — [`MP5_PUBLIC_DEMO_COPY.md`](MP5_PUBLIC_DEMO_COPY.md)
- **README screenshots:** [`docs/screenshots/`](screenshots/README.md) — linked from GitHub and copied to `/screenshots/` on deploy
- **Visual polish:** in-app demo fixture loader (`/fixtures/demo_mp5l_v3_tone.mp5`), codec helper, empty states, responsive layout, focus rings
- **Two-step convert:** load file → review/edit → **Export MP5** button
- **Player import feedback:** drop summary (added / skipped / unreadable with calm reasons)
- **Player:** MP5-L v2/v3, PCM (reference), MP5-H (hybrid + CORR), MP5-C (lab)
- **Player playlist (MVP):** multi-file playlist (drop append), search, queue controls, auto-advance, repeat (off/all/one), shuffle, decode cache (3 tracks), session metadata persistence
- **Local library (MVP):** IndexedDB storage on device — save from player, converter export, or library import; search/filter; play, queue, download, delete; storage honesty + quota estimate when supported
- **Stems (MVP):** optional **STEM** manifest + **STDA** audio — manual WAV/FLAC import; synthetic demo `demo_mp5l_v3_stems.mp5`; validation script + unit tests; player UX clarity, memory guardrails, safe stem download filenames; opt-in stem mix — [`MP5_STEMS.md`](MP5_STEMS.md)
- **Now playing:** large cover, title/artist/album, codec and content guidance badges, mood/vibe chips
- **Metadata panel:** track info, cover, lyrics, content guidance, mood/vibe, **VISU visual theme** swatches, **credits / rights / identifiers**, **integrity & fingerprint**, waveform stats, format — with calm empty states
- **Visual themes (VISU MVP):** optional per-file colors/mood; player accent + soft gradient; Settings toggle to disable file themes — [`MP5_VISUAL_THEMES.md`](MP5_VISUAL_THEMES.md)
- **Album package (MVP):** experimental `.mp5p` manifest + sidecar `.mp5` tracks; import explainer, found/missing lists, add sidecars, reorder on create, saved albums in Library (localStorage), validation — [`MP5_ALBUM_PACKAGE.md`](MP5_ALBUM_PACKAGE.md)
- **Credits / rights / identifiers (MVP):** optional **CRDT**, **LICN**, **IDEN** chunks; converter collapsed sections; player informational display (no enforcement) — [`MP5_CREDITS_RIGHTS.md`](MP5_CREDITS_RIGHTS.md)
- **Fingerprint / integrity (MVP):** optional **FING** + **HASH**; MP5-L export embeds hashes; player verification panel; library duplicate detection; album sidecar `fileSha256` — [`MP5_FINGERPRINT_INTEGRITY.md`](MP5_FINGERPRINT_INTEGRITY.md)
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
- Batch: MP5-L v3 only; no per-file metadata editor (use Single file); no stems/karaoke/sections in batch; no ZIP download; **Download all** triggers separate browser downloads (may be blocked); closing tab cancels active batch
- Browser memory: decode cache holds up to 3 decoded tracks; stem mix loads all stems into RAM; diagnostics estimates are approximate
- Player: no drag-reorder; playlist file handles are not restored after full page reload (session metadata only)
- Local library: per-browser/device only; no sync across devices; IndexedDB cleared if user clears site data; very large libraries may hit browser quota
- Stems: no AI separation; stem mix loads all stems into RAM (~120 MB MVP cap); no per-stem seek; max 32 stems; `demo_mp5l_v3_stems.mp5` for demos; other players may ignore STEM/STDA
- Browser downloads cannot overwrite existing files predictably; use export summary **Download again** or variant filenames
- **Open in Player** uses in-memory `File` from the last export in this session only (not persisted across reload)

## Metadata limitations

- MP5 is general-purpose audio — content guidance and specialized metadata are optional; normal playback never depends on them
- Haven / Recovery is one optional profile, not the format identity
- Custom app tags profile is documented but postponed (no APPT chunk in MVP converter)
- No AI tagging or auto content guidance
- Mood/vibe: comma-separated + suggestion chips
- **Karaoke / synced lyrics (MVP):** LYRC `timeMs` synced lines, converter `[mm:ss.xx]` editor, player lyrics panel + karaoke mode — demo `demo_mp5l_v3_stems.mp5`
- **Song sections (MVP):** SECT/HOOK/HILT chunks, converter section map editor, player song map + smart nav + waveform markers — [`MP5_SECTIONS.md`](MP5_SECTIONS.md)
- **Highlight / preview clips (MVP):** HILT panel, play/preview highlights, loop section/hook, stop-at-end preview — local player only, no export — [`MP5_SECTIONS.md`](MP5_SECTIONS.md)
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
| **Vercel / Netlify** | Project **`mp5-audio`** — `vercel.json`, [`MP5_VERCEL_SETUP.md`](MP5_VERCEL_SETUP.md) |
| **Local prod preview** | `pnpm demo:prod` or `pnpm preview` |
| **Dist validation** | `pnpm deploy:check` |

Deploy checklist: `alpha:check` → `build` → `deploy:check` → `demo:prod` → browser smoke.

**Public demo URL:** https://mp5-audio.vercel.app — [`MP5_VERCEL_SETUP.md`](MP5_VERCEL_SETUP.md). Do not use `mp5-alpha-demo.vercel.app` or `dist-livid-two-82.vercel.app`.

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
