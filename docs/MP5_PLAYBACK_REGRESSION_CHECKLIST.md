# MP5 playback regression checklist

**Version:** MP5 Audio v0.11.0-alpha  
**Purpose:** Manual and automated gates before shipping playback/transport changes.  
**Automated gate:** `pnpm playback:check` · **Full release gate:** `pnpm alpha:check`

## Synthetic fixture (CI)

| Item | Value |
|------|--------|
| File | `test-fixtures/demo_pity_party_class.mp5` |
| Generator | `pnpm fixtures:pity-party-class` |
| Profile | MP5-L full mix, **STDF v1** stems, **no instrumental** (karaoke = mute-vocals subset) |
| Stems | 10 — includes **Lead Vocal** and **BG Vocal** |
| Duration | ~12 s (enough for progress-clock e2e) |
| Chunks | LYRC, SECT, HOOK, HILT, VISU |

## Manual stress file (not in repo)

| Item | Value |
|------|--------|
| File | User-local **Melanie Martinez - Pity Party.mp5** (copyrighted) |
| Size class | ~260+ MiB lazy STDF |
| Stems | 10, STDF segmented, **no instrumental** |
| Karaoke | Non-vocal subset only; vocals muted in preset |
| Critical path | **Late Lead Vocal join** — load + unmute while playing mid-song; must stay on same section as backing |

---

## Checklist

Mark each item **PASS** / **FAIL** / **N/A** on the build under test.

### Full mix

- [ ] Load fixture or Pity Party → full mix plays from **Play** (no waveform click required).
- [ ] **Play** toggles to Pause; status shows playing.
- [ ] Progress bar advances in real time (~1 s per wall second).
- [ ] **Waveform** click at ~50% seeks; time updates; playback continues if it was playing.
- [ ] Seek slider moves time without resetting to 0:00 incorrectly.

### Karaoke

- [ ] **Karaoke Mode** on → non-vocal stems prepare (no instrumental path on Pity Party class).
- [ ] **Play** after karaoke → stem mix starts without clicking waveform.
- [ ] Synced lyrics visible; active line advances with playback.
- [ ] Progress clock follows stem mix (not frozen at 0:00 while playing).
- [ ] If stem prep fails / unavailable → **karaoke fallback** to full mix still plays with lyrics (when applicable).

### Stem mix

- [ ] **Enable stem mix** / karaoke prep → transport switches; full mix stops (no double audio).
- [ ] Check/uncheck stem → does **not** stop entire playback.
- [ ] Mute/unmute loaded stem → no full-graph reload; playhead does not jump to 0:00.
- [ ] **Restart stem mix** → all audible stems realign at current playhead.
- [ ] **Return to full mix** → stem sources stop; full mix resumes at playhead.

### Late vocal join (Pity Party class / real Pity Party)

- [ ] Start karaoke or stem mix; play to **≥ 30 s** (or mid-verse).
- [ ] Check **Lead Vocal**; wait for decode (Loaded badge).
- [ ] **Unmute** Lead Vocal → vocal aligns with backing (same section, not chorus jump).
- [ ] Transport diagnostics show **no OVERLAP**.
- [ ] Progress keeps advancing.

### Overlap / transport

- [ ] Never hear doubled full mix + stem mix simultaneously.
- [ ] Diagnostics transport line does not show `OVERLAP` during normal use.
- [ ] Settings → **Copy playback trace** exports JSON with `overlapDetected: false` during clean play.

### Lyrics / song map / scroll

- [ ] Lyrics follow playback when auto-scroll on.
- [ ] Song map section highlight updates with time.
- [ ] Scroll page down during playback → **window does not jump** to lyrics/song map.

### VISU / integrity

- [ ] VISU theme applies on pity-party-class / Pity Party (accent/wash visible).
- [ ] No stem CRC / missing-fragment errors in Stems panel during prepare.

### Diagnostics

- [ ] Enable playback trace → events appear; **Copy playback trace** copies snapshot + log.
- [ ] `lastPlaybackRequestReason` updates on Play / seek.
- [ ] `activeStemIds` lists expected stems during karaoke.

## Remaining manual QA limitations

Automated gates use `demo_pity_party_class.mp5` (~10 MiB, 12 s, STDF v1). They do **not** replace:

- User-local **Pity Party** (~260 MiB lazy STDF) full-session stress test
- Subjective vocal alignment / section sync on real copyrighted material
- Browser-specific autoplay or memory limits on very large files
- Hosted demo URL verification (`pnpm test:e2e:hosted`)

Run the checklist in this doc against Pity Party after `pnpm playback:check` and `pnpm alpha:check` pass locally.

---

| Field | Value |
|-------|--------|
| Build | MP5 Audio v0.11.0-alpha |
| Date | |
| Tester | |
| Fixture | demo_pity_party_class / Pity Party |
| Result | |
