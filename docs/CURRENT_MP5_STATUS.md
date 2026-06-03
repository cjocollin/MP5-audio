# Current MP5 status (Alpha Demo + Metadata MVP)

**Version:** MP5 Audio **v0.13.0-alpha** · **Date:** May 2026 · **Status:** **Beta readiness / QA hardening** (experimental Alpha — not Beta yet)

**Spec toolkit:** [`MP5_CHUNK_REGISTRY.md`](MP5_CHUNK_REGISTRY.md) · [`MP5_COMPATIBILITY_POLICY.md`](MP5_COMPATIBILITY_POLICY.md) · [`MP5_FEATURE_MATRIX.md`](MP5_FEATURE_MATRIX.md) · `pnpm inspect:mp5` · `pnpm validate:mp5` / `pnpm validate:mp5p`

**Live demo:** https://mp5-audio.vercel.app · **GitHub:** https://github.com/cjocollin/MP5-audio

**Share / run:** `pnpm demo` · **Playback gate:** [`MP5_PLAYBACK_REGRESSION_CHECKLIST.md`](MP5_PLAYBACK_REGRESSION_CHECKLIST.md) · `pnpm playback:check` · **Verify:** `pnpm alpha:check` · **Pre-Beta:** `pnpm beta:check`

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
- **Playback regression harness (v0.11.0-alpha):** synthetic `demo_pity_party_class.mp5`; `pnpm playback:check`; behavioral Playwright specs; playback trace export; manual Pity Party remains user-local copyright stress test
- **Karaoke Play / clock hotfix (v0.10.12-alpha):** canonical `requestPlayback` for Play, waveform, and seek; Play after Karaoke Mode starts stem mix (no waveform workaround); progress clock follows active transport in karaoke/stem/full mix; lyrics scroll fix preserved
- **Real playback state audit (v0.10.12-alpha):** single transport/clock authority; first Play enters preparing then starts when PCM ready; unloaded-stem unmute never disposes active graph; UI clock gated on live sources; lyrics panel scroll is container-local only; optional playback trace in Diagnostics
- **Stem mixer clock / unmute / scroll (v0.10.11-alpha):** superseded by v0.10.12 transport audit for manual Pity Party scenarios
- **Stem mixer seamless toggle (v0.10.10-alpha):** checkbox/mute/volume use per-stem insert/remove/gain patch only — no hidden `loadTracks`; explicit **Restart stem mix** button
- **Stem transport exclusivity (v0.10.9-alpha):** one playback authority (full_mix vs stem_mix/solo/karaoke); per-stem source registry; graph generation tokens for stale async loads; overlap detection in Stems diagnostics
- **Stem mixer toggle / live stem add (v0.10.8-alpha):** checkbox = **selected** only (does not stop full mix); **Enable stem mix** switches transport; mute/gain patches without restart; live stem insert at current playhead; state badges (Selected/Loaded/Active/Muted/Preparing)
- **Lazy STDF stem lookup + VISU player hotfix (v0.10.7-alpha):** worker stem jobs load STDF fragments by **stemId** from lazy index; per-stem availability in Stems panel; **visible VISU** on active player (cover ring/scrim, column wash, preset colors when file has no hex — e.g. Pity Party `cinematic`); metadata theme status line
- **Large-file lazy ingest (v0.10.6-alpha):** blob chunk index for files ≥48 MiB — no full-file `ArrayBuffer` + no eager STDF copy; AUDI loaded for playback only; stems on demand; integrity pending → idle verify; Settings diagnostics show ingest mode/timing
- **Large-file + VISU hotfix (v0.10.5-alpha):** STDF worker CRC wire fix; VISU style presets; informational whole-file hash (`audio_verified`)
- **Worker stem decode (v0.10.4-alpha):** Web Worker for STDF reconstruct + MP5-L decode; per-stem transferable payloads; progress phases + cancel; main-thread fallback; worker diagnostics in Stems panel — full mix never blocked
- **Large stem playback (v0.10.3-alpha):** lazy/selected stem decode, solo, progressive prepare + cancel, instrumental karaoke path, playback-clock synced lyrics — full mix never blocked
- **Large embedded stems (v0.10.2-alpha):** **STDF** segmented stem fragments when **STDA** would exceed 64 MiB; **STDA v1** unchanged for small sets; `pnpm inspect:mp5` reports storage mode and fragment stats
- **Stem import fix (v0.10.1-alpha):** single file picker; pre-import RAM **warnings only**; sequential normalize for large batches
- **Stem normalize (v0.10.1-alpha):** normalize stems **one at a time** with progress status (avoids crashing when normalizing many large stems at once)
- **Beta readiness (v0.10.0-alpha):** [`MP5_BETA_READINESS.md`](MP5_BETA_READINESS.md), [`MP5_KNOWN_ISSUES.md`](MP5_KNOWN_ISSUES.md), `pnpm beta:check`, golden fixture validation, public-claims audit tests, centralized user-facing errors
- **Spec freeze / compatibility toolkit (v0.9.0-alpha):** canonical chunk registry, compatibility policy, feature matrix; `inspect:mp5` / `validate:mp5` CLIs; player Format compatibility summary; golden fixture validation profiles
- **Batch stem import + normalization (v0.8.2-alpha):** import multiple stems at once, filename type guessing, batch summary, bulk normalize/remove; **Normalize stems to match full mix** — [`MP5_STEMS.md`](MP5_STEMS.md)
- **Performance / reliability (v0.8.0-alpha):** Settings **Diagnostics** panel; guardrails for large sources, batch queues, library quota, stem RAM; improved cancel/cleanup for single + batch conversion; decode cache stats/clear on queue/library clear; object URL revoke on downloads; FFmpeg load failure messaging
- **Metadata export (MVP):** track info, cover, unsynced/synced lyrics, optional **content guidance** (grouped: content notices, sensitive themes, listener comfort) — **never auto-generated**
- **Content guidance source:** manual tags export as **user-provided** (`warningSource: user`)
- **Metadata editor:** music-first layout; **Specialized app metadata** with profile selector (Haven / Recovery last; fields only when selected; collapsed by default)
- **Export preview:** detected vs edited vs embedded; empty fields skipped
- **Converter polish:** numbered flow steps, export progress labels, post-export summary, safe filenames (`Artist - Title.mp5`), **Open in Player** / **Add to playlist**
- **Compatibility pass:** synthetic WAV/MP5 fixtures, `pnpm compatibility:check`, [`MP5_COMPATIBILITY_REPORT.md`](MP5_COMPATIBILITY_REPORT.md), supported-sources UI
- **Public landing (v0.10.7):** compact app-first hero + tabs immediately below; long sections (codec cards, screenshots, honesty) behind **Learn more about MP5** (collapsed by default, localStorage preference) — [`MP5_PUBLIC_DEMO_COPY.md`](MP5_PUBLIC_DEMO_COPY.md)
- **README screenshots:** [`docs/screenshots/`](screenshots/README.md) — linked from GitHub and copied to `/screenshots/` on deploy
- **Visual polish:** in-app demo fixture loader (`/fixtures/demo_mp5l_v3_tone.mp5`), codec helper, empty states, responsive layout, focus rings
- **Two-step convert:** load file → review/edit → **Export MP5** button
- **Player import feedback:** drop summary (added / skipped / unreadable with calm reasons)
- **Player:** MP5-L v2/v3, PCM (reference), MP5-H (hybrid + CORR), MP5-C (lab)
- **Player playlist (MVP):** multi-file playlist (drop append), search, queue controls, auto-advance, repeat (off/all/one), shuffle, decode cache (3 tracks), session metadata persistence
- **Local library (MVP):** IndexedDB storage on device — save from player, converter export, or library import; search/filter; play, queue, download, delete; storage honesty + quota estimate when supported
- **Stems (MVP):** optional **STEM** manifest + **STDA** (small) or **STDF** fragments (large) — manual WAV/FLAC import; synthetic demo `demo_mp5l_v3_stems.mp5`; `inspect:mp5` / `validate:mp5`; player UX clarity, memory guardrails, safe stem download filenames; opt-in stem mix — [`MP5_STEMS.md`](MP5_STEMS.md)
- **Now playing:** large cover, title/artist/album, codec and content guidance badges, mood/vibe chips
- **Metadata panel:** track info, cover, lyrics, content guidance, mood/vibe, **VISU visual theme** swatches, **credits / rights / identifiers**, **integrity & fingerprint**, waveform stats, format — with calm empty states
- **Visual themes (VISU MVP):** optional per-file colors/mood; player accent + soft gradient; Settings toggle to disable file themes — [`MP5_VISUAL_THEMES.md`](MP5_VISUAL_THEMES.md)
**v0.13.0-alpha — Batch album builder / MP5P export MVP:** Converter **Batch album export** — metadata table, track order, manifest or embedded `.mp5p` from batch queue. See [`MP5_ALBUM_PACKAGE.md`](MP5_ALBUM_PACKAGE.md).

**v0.12.1-alpha — VISU / cover mobile containment hotfix:** VISU tint and cover art are scoped to the Now Playing card only. See [`MP5_VISUAL_THEMES.md`](MP5_VISUAL_THEMES.md).

- **Embedded album package prototype (v0.12.0-alpha):** binary `.mp5p` with `MP5P` magic, fragmented embedded `.mp5` tracks, lazy ingest/play, create UI (manifest vs embedded), inspect/validate CLI — [`MP5_EMBEDDED_PACKAGE.md`](MP5_EMBEDDED_PACKAGE.md)
- **Album package (MVP):** experimental `.mp5p` manifest + sidecar `.mp5` tracks (unchanged); import explainer, found/missing lists, add sidecars, reorder on create, saved albums in Library — [`MP5_ALBUM_PACKAGE.md`](MP5_ALBUM_PACKAGE.md)
- **Credits / rights / identifiers (MVP):** optional **CRDT**, **LICN**, **IDEN** chunks; converter collapsed sections; player informational display (no enforcement) — [`MP5_CREDITS_RIGHTS.md`](MP5_CREDITS_RIGHTS.md)
- **Fingerprint / integrity (MVP):** optional **FING** + **HASH**; MP5-L export embeds hashes; player shows **audio verified** when PCM/AUDI match (in-file whole-file hash is informational/pre-embed); strict CLI passes on `audio_verified`; library duplicate detection; album sidecar `fileSha256` — [`MP5_FINGERPRINT_INTEGRITY.md`](MP5_FINGERPRINT_INTEGRITY.md)
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
- Stems: no AI separation; lazy selected/solo decode (not all-at-once); preparing 200+ MB embedded sets takes time; no per-stem seek; max 32 stems; other players may ignore STEM/STDA/STDF
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
pnpm inspect:mp5 <file>   # compatibility report (.mp5 or .mp5p)
pnpm validate:mp5 <file>  # exit code validation (--profile playable|rich|strict)
pnpm validate:mp5p <manifest.mp5p> --dir <folder> --profile package
pnpm fixtures:validate    # golden demo fixtures
pnpm build                # production web dist (PWA)
pnpm pwa:check            # manifest + icons
node scripts/validate-metadata-demo.mjs  # metadata chunk roundtrip validation
pnpm alpha:origami-smoke  # optional; needs ORIGAMI FLAC on Desktop
pnpm alpha:origami-parity
```

## Remaining blockers before Beta

| Area | Blocker |
|------|---------|
| MP5-C | Audible hiss — not suitable as default or distribution codec |
| MP5-L compression | Does not meet ≤0.80× PCM stretch goal on reference material |
| Strict validation | Full HASH byte verification in CLI not yet exhaustive |
| Album `.mp5p` | Sidecar resolution and cover file refs incomplete in player MVP |
| Moonshot / registry chunks | Many FourCCs reserved without decoders |
| Cross-player ecosystem | Third-party MP5 players do not exist |
| Legal / rights | No enforcement layer — by design; informational metadata only |
