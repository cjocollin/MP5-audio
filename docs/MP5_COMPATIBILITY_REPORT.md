# MP5 Real-World Compatibility Report (Alpha)

**Date:** May 2026 · **Version:** MP5 Audio v0.9.0-alpha  
**Milestones:** Real-World Compatibility Pass · Spec Freeze / Compatibility Toolkit  
**Automated gates:** `pnpm compatibility:check` · `pnpm fixtures:validate` · `pnpm validate:mp5`  
**Policy:** [`MP5_COMPATIBILITY_POLICY.md`](MP5_COMPATIBILITY_POLICY.md) · MP5-L v3 default · MP5-C lab-only · MP5-H hybrid/large/not default · PCM reference/debug

This report documents how MP5 Alpha behaves with common source formats, metadata edge cases, and player import scenarios. **No copyrighted music is committed to the repository.** Automated tests use synthetic tones in `test-fixtures/compatibility/`.

---

## Summary

| Area | Automated (CI) | Manual (local) |
|------|----------------|----------------|
| WAV mono/stereo, 44.1 / 48 kHz, short & long | **Pass** (fixture + WASM round-trip) | Re-test with your own WAV exports |
| FLAC / MP3 / M4A / OGG | Fixture **presence** when `ffmpeg` on PATH | Full convert via Converter + FFmpeg.wasm in browser |
| MP5-L v3 export + waveform/seek | **Pass** | — |
| Bit-exact decode (MP5-L) | **Pass** (WASM null test on fixtures) | Compare against source WAV in player |
| Metadata edge cases | **Pass** (unit + fixture parse) | Visual check in Converter preview |
| Player import (multi / mixed / corrupt / codecs) | **Pass** | Drop your own exports |
| Unknown optional chunks | **Pass** (`FUTR` preserved) | — |

---

## 1. Source formats tested

### Automated (synthetic fixtures)

| Format | Fixture | Channels | Rate | Duration | MP5-L export | Bit-exact |
|--------|---------|----------|------|----------|--------------|-----------|
| WAV | `wav_mono_44k_short.wav` | mono | 44.1 kHz | 1.5 s | Pass | Pass |
| WAV | `wav_stereo_44k_short.wav` | stereo | 44.1 kHz | 1.5 s | Pass | Pass |
| WAV | `wav_mono_48k_short.wav` | mono | 48 kHz | 1.0 s | Pass | Pass |
| WAV | `wav_stereo_48k_short.wav` | stereo | 48 kHz | 1.0 s | Pass | Pass |
| WAV | `wav_stereo_44k_long.wav` | stereo | 44.1 kHz | 3.0 s | Pass | Pass |

### Generated when `ffmpeg` is on PATH (`pnpm compatibility:fixtures`)

| Format | Fixture | Notes |
|--------|---------|--------|
| FLAC | `flac_stereo_44k_short.flac` | Magic-byte check in CI; **browser convert** requires FFmpeg.wasm |
| MP3 | `mp3_stereo_44k_short.mp3` | ID3 header check |
| M4A/AAC | `m4a_stereo_44k_short.m4a` | Size/magic check |
| OGG/Opus | `ogg_opus_44k_short.ogg` | OggS magic check |

### Manual-only (use your own files locally)

- Commercial releases (do not commit)
- 24-bit / float WAV (may fail native decode — re-export 16-bit PCM WAV)
- Very long albums (>10 min) — may be slow on first FFmpeg.wasm load

---

## 2. Convert → MP5-L v3 verification

For each **WAV** fixture, automated tests confirm:

1. **Export succeeds** — `convertToMp5` + WASM `encode_mp5l`
2. **Container valid** — `parseMp5` + `validateParsedFile`
3. **Waveform + seek chunks** — present on parsed file
4. **Format labels** — `describeMp5lPlayback` reports bit-exact MP5-L v3
5. **Decode bit-exact** — WASM `decode_mp5l` matches source samples sample-for-sample

**Browser path (manual):** After export, **Open in Player** or drop the `.mp5` — playback, seek bar, and Format panel should match MP5-L v3 defaults.

### Alpha limitation (honest)

| Source path | PCM before encode |
|-------------|-------------------|
| **WAV** (Web Audio) | Native sample rate & channels preserved |
| **FFmpeg.wasm** (FLAC, MP3, …) | Resampled to **44.1 kHz stereo** |

Bit-exact MP5-L export is relative to the **PCM fed to the encoder**. For FFmpeg sources, that is the transcoded stereo 44.1 kHz stream, not necessarily the original file’s channel layout or rate.

---

## 3. Metadata edge cases

| Case | Expected behavior | Automated |
|------|-------------------|-----------|
| Missing title | Filename or artist-only tags; safe export name fallback | Pass (fixtures) |
| Missing artist | Title-only metadata | Pass |
| Missing album art | Export without COVR; player shows placeholder | Pass |
| Very long title | Stored in META; filename sanitized/truncated | Pass |
| Special characters / emoji | Stored in META; filename sanitized | Pass |
| Invalid filename chars | Replaced in `Artist - Title.mp5` | Pass |
| Cover > 2 MiB | Blocked at write (container security) | Pass |
| Unsupported image type | Editor uses MIME sniff; prefer JPEG/PNG | Manual |
| Empty lyrics | LYRC chunk omitted | Pass (bundle logic) |
| Manually removed cover | `cover: null` → no COVR on export | Pass |
| Edited EXPL / mood / vibe | Optional chunks embedded when flags set | Pass |

Metadata from **FFmpeg** depends on source tags; failures fall back to filename title with a calm status message (no invented warnings).

---

## 4. Player import edge cases

| Case | Behavior | Automated |
|------|----------|-----------|
| Multiple valid `.mp5` | All added; summary shows count | Pass |
| Mixed `.mp5` + non-MP5 | Valid added; others skipped with reason | Pass |
| Corrupt/truncated `.mp5` | Queued as unreadable; does not block valid files | Pass |
| MP5-C lab file | Loads; format panel shows experimental / may hiss | Pass |
| MP5-H + CORR | Enhanced decode path when CORR present | Pass (labels) |
| MP5-H without CORR | Base-only warning in format panel | Pass |
| Unknown optional chunk (`FUTR`) | Preserved in `optional` map | Pass |

---

## 5. Recommended source formats for Alpha

**Best experience**

1. **16-bit PCM WAV** — fastest decode, preserves rate/channels, bit-exact MP5-L path
2. **FLAC** — lossless intermediate; use when you already store FLAC (FFmpeg.wasm required)

**Supported with caveats**

3. **MP3 / M4A / OGG** — FFmpeg.wasm; 44.1 kHz stereo transcode; tag/cover extraction varies

**Not recommended for listening exports**

- **MP5-C** — lab-only, may hiss
- **MP5-H** — large; default export remains MP5-L v3

---

## 6. Known limitations

- First Converter load downloads FFmpeg.wasm (~tens of MB) — needs network
- FFmpeg path forces **44.1 kHz stereo** before encode
- Batch convert is sequential and browser-local (see Settings → Diagnostics); no ZIP export
- Player playlist files are not restored after full page reload
- 32-bit float / multichannel exotic WAV may need re-export
- Synced lyrics editor not in converter UI
- Custom app tags profile postponed (no APPT chunk)
- Real-world MP3/VBR edge cases not exhaustively fuzz-tested in CI

---

## 7. Commands

```bash
# Regenerate synthetic compatibility fixtures
pnpm compatibility:fixtures

# Full compatibility pass (fixtures + vitest)
pnpm compatibility:check

# Release gate (includes demo fixtures, not compatibility folder)
pnpm alpha:check
```

Fixture manifest: `test-fixtures/compatibility/manifest.json`

---

## 8. UI honesty

The Converter tab includes **Supported source formats (Alpha)** with per-format notes, FFmpeg transcode disclaimer, and metadata limits. Decode errors use format-specific hints via `decodeFailureHint()`.

Codec policy banners are unchanged: MP5-L recommended, MP5-C lab-only, MP5-H hybrid/large.

## 9. Performance & reliability (v0.8.0-alpha)

| Feature | Behavior |
|---------|----------|
| **Settings → Diagnostics** | Collapsed panel: playlist queue size, decode cache (max 3 tracks + RAM estimate), library storage, current file size, WASM/FFmpeg load state, active conversion |
| **Guardrails** | Calm warnings for large sources, long batches (12+), library quota pressure, heavy stem mix; hard block only for extreme sizes |
| **Cancel** | Single-file and batch conversion support cancel; stale exports skip auto-download |
| **Object URLs** | Download helpers revoke blob URLs after each click; cover previews revoke on change/unmount |
| **Decode cache** | Cleared when player queue is cleared or local library is cleared |
| **FFmpeg** | Explicit error if WASM assets fail to load (hosted builds must include FFmpeg in dist) |
