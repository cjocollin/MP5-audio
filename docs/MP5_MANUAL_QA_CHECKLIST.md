# MP5 Manual QA checklist

**Version:** MP5 Audio v0.15.0-alpha · **Purpose:** Pre-demo / pre-Beta smoke on a real browser

Use synthetic fixtures only unless you own the source audio. Record pass/fail and browser (Chrome, Firefox, Safari, mobile).

---

## A. Normal track playback

- [ ] Load `demo_mp5l_v3_tone.mp5` (Demo tab or Player drop)
- [ ] Play / pause / seek / volume work
- [ ] Waveform and Format panel show MP5-L v3
- [ ] Queue: add second file, next/previous

## B. Pity Party-style large stem file

- [ ] Load `demo_pity_party_class.mp5` (local fixture or regression harness)
- [ ] Stems panel lists stems without blocking full mix
- [ ] Solo / mute / stem mix toggles behave
- [ ] No overlapping full mix + stem mix audio

## C. Karaoke and late vocal join

- [ ] Load `demo_mp5l_v3_stems.mp5`
- [ ] Enable Karaoke mode; lyrics sync while playing
- [ ] Play after enabling karaoke (no waveform workaround required)

## D. Stems mute / unmute / check / uncheck

- [ ] Checkbox selects stem without stopping full mix
- [ ] Enable stem mix switches transport
- [ ] Mute and volume patches do not reset playhead unexpectedly

## E. Metadata / lyrics / VISU

- [ ] Title, artist, album visible in Now Playing
- [ ] Lyrics panel scrolls within container during playback
- [ ] VISU tint stays on Now Playing card only (not full-page wallpaper on mobile)

## F. Single-file conversion

- [ ] Converter → Single: drop WAV/FLAC
- [ ] MP5-L v3 default; export succeeds
- [ ] Open in Player or download

## G. Batch conversion

- [ ] Converter → Batch: two+ files
- [ ] Progress summary; download individual MP5s

## H. Manifest `.mp5p`

- [ ] Drop `demo_album_package.mp5p` + sidecar `.mp5` files
- [ ] Sidecar warning if files missing; play when resolved

## I. Embedded `.mp5p`

- [ ] Drop `demo_embedded_album_package.mp5p` alone
- [ ] Album view: play track, play album (lazy load)
- [ ] Extract track; save confirmation if large

## J. Library save / load / delete

- [ ] Save track to library; play from Library tab
- [ ] Save manifest or embedded album; Saved albums list
- [ ] Delete entry; storage note understood

## K. Mobile viewport (~390px)

- [ ] Tabs readable; no horizontal overflow on Player / Converter / album view
- [ ] Buttons tappable (min ~40px)
- [ ] Album cover not full-screen

## L. Hosted deployment

- [ ] https://mp5-audio.vercel.app loads; version badge matches release
- [ ] MP5-L demo button works
- [ ] PWA manifest + icons load
- [ ] No copyrighted audio in deployed fixtures

---

**Sign-off:** _______________ · **Date:** _______________ · **Browser / OS:** _______________
