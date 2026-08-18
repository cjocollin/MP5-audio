# MP5 Manual QA Checklist

**Version:** MP5 Audio v0.29.0-beta  
**Purpose:** Public Beta hosted/demo smoke using synthetic fixtures.  
**Hosted URL:** https://mp5-audio.vercel.app

Status key: **Pass**, **Pass with limitation**, **Blocked**, **Not tested**.

## A. Hosted App Shell

- [ ] Badge shows `MP5 Public Beta - v0.29.0-beta`.
- [ ] Public copy remains experimental and honest.
- [ ] Settings and diagnostics open.

## B. Player

- [ ] MP5-L demo loads and plays.
- [ ] Play, pause, seek, volume, previous/next, and queue controls work.
- [ ] Now Playing shows title, artist, album, source badge, duration, remaining time, and integrity/VISU state when available.
- [ ] Queue rows show current row state, source badge, album context, duration, and empty state clearly.

## C. Karaoke / Lyrics / Stems

- [ ] Karaoke demo loads.
- [ ] Lyrics panel shows synced line highlighting and previous/upcoming context.
- [ ] Karaoke toggle works.
- [ ] Stem states are readable when stems are present.

## D. Album Packages

- [ ] Embedded album demo opens.
- [ ] Play all queues the embedded tracks.
- [ ] Source badge distinguishes embedded `.mp5p`.
- [ ] Manifest `.mp5p` remains covered by local package validation.

## E. Converter / Batch

- [ ] Converter tab opens.
- [ ] Batch tab opens.
- [ ] Batch Album Builder opens.
- [ ] Export copy remains local/browser-only and MP5-L v3 recommended.

## F. Mobile / VISU

- [ ] 375x812 viewport has no horizontal overflow.
- [ ] Tabs and player controls are tappable.
- [ ] Embedded album view remains readable.
- [ ] VISU accent follows the active file across app chrome; neutral surfaces remain readable and cover art stays contained to Now Playing.

## G. Privacy / Release Hygiene

- [ ] No telemetry, upload, or cloud sync claims.
- [ ] No DRM/legal-proof/beat-codec claims.
- [ ] No local/private/copyrighted audio is committed or deployed.
- [ ] Diagnostics copy remains manual and path-redacted.

## H. Hosted deployment

- [ ] Production URL is https://mp5-audio.vercel.app.
- [ ] `hosted:verify` passes.
- [ ] `test:e2e:hosted` passes.

## I. Physical Phone Spot-Check (Optional)

- [ ] Hosted URL opens on a real phone.
- [ ] Landing fits without horizontal scroll.
- [ ] MP5-L demo plays.
- [ ] Embedded album demo opens.
- [ ] Settings and feedback links are visible.

## Sign-Off

Pending v0.29.0-beta hosted verification.
