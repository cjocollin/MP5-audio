# MP5 Manual QA checklist

**Version:** MP5 Audio **v0.16.2-beta**  
**Purpose:** Public Beta smoke. Synthetic fixtures on hosted demo; local fixtures for Pity Party / sidecar manifest.  
**Sign-off date:** May 2026 · **Hosted URL:** https://mp5-audio.vercel.app

Status key: **Pass** · **Pass with limitation** · **Blocked** · **Not tested**

---

## A. Normal track playback

- [x] **Pass** — MP5-L demo loads and plays on hosted (Playwright + hosted e2e)
- [x] **Pass** — Play / pause / seek / volume (hosted MP5-L demo playback)
- [x] **Pass** — MP5-L v3 visible in UI
- [ ] **Not tested** — Queue add/remove on hosted (local e2e covers playlist)

## B. Pity Party-style large stem file

- [x] **Pass with limitation** — `demo_pity_party_class.mp5` via local `pnpm playback:check` / playback-regression e2e (not shipped on hosted)

## C. Karaoke and synced lyrics

- [x] **Pass** — Hosted karaoke demo loads; karaoke mode toggles on; play enabled

## D. Stems mute/unmute/check/uncheck

- [ ] **Not tested** — Hosted automated QA (local stems e2e + playback-regression cover core paths)

## E. Metadata / lyrics / VISU

- [x] **Pass with limitation** — Lyrics panel on karaoke demo; VISU containment via local `visual-theme-containment` + mobile smoke e2e

## F. Single-file conversion

- [x] **Pass with limitation** — Converter panel reachable on hosted; full WAV drop not run on hosted (local converter e2e)

## G. Manifest `.mp5p`

- [x] **Pass with limitation** — Local `demo_album_package.mp5p` e2e; sidecar UX not re-run on hosted this session

## H. Embedded `.mp5p`

- [x] **Pass** — Hosted embedded album demo (fixed v0.16.1); HADES manual QA accepted locally (prior milestone)

## I. Library save / load / delete

- [x] **Pass with limitation** — Library panel + browser-local honesty on hosted; save/delete not automated on hosted

## J. Mobile viewport (Playwright, 375x812)

- [x] **Pass** — Hosted mobile e2e: no horizontal overflow, tappable tabs/buttons, embedded album readable

## K. Hosted deployment

- [x] **Pass** — Badge **MP5 Public Beta**; `hosted:verify`; `test:e2e:hosted` **11/11**; PWA/WASM/FFmpeg 200; synthetic fixtures only

## L. Physical phone spot-check (real device)

Use https://mp5-audio.vercel.app on a phone browser. No large copyrighted local files required — hosted demos only.

- [ ] **Not tested** — Hosted URL opens on phone
- [ ] **Not tested** — Landing fits without horizontal scroll
- [ ] **Not tested** — Tabs are tappable (Player, Converter, Demo, Settings)
- [ ] **Not tested** — Demo guide opens
- [ ] **Not tested** — MP5-L demo loads and plays
- [ ] **Not tested** — Embedded album demo opens
- [ ] **Not tested** — Player controls usable (play/pause, seek)
- [ ] **Not tested** — Settings and Diagnostics open
- [ ] **Not tested** — Report a bug / feedback links visible in Settings
- [ ] **Not tested** — VISU stays contained (no giant wallpaper bug)
- [ ] **Not tested** — App does not feel frozen after loading demos

**Note:** Automated mobile viewport QA (section J) passed; section L is optional manual confirmation on a physical device.

---

**Sign-off:** Public Beta accepted — automated hosted QA + maintainer review · **Date:** May 2026 · **Browser / OS:** Desktop Chrome (Playwright); mobile viewport 375x812 (Playwright); physical phone **pending**
