# MP5 Song Sections (SECT / HOOK / HILT — MVP)

Optional **song structure** metadata for smart navigation — manually provided, no AI song analysis.

## Policy

- **Optional** — playback uses AUDI only; missing SECT/HOOK/HILT never blocks decode.
- **Manual only** — converter textarea; no automatic section detection.
- **Third-party players** may ignore these chunks and play normally.

## Chunks (MVP decision)

| FourCC | Role |
|--------|------|
| **SECT** | Ordered song sections (intro, verse, chorus, …) |
| **HOOK** | Best replayable hook (derived from first `hook` section on export, or explicit) |
| **HILT** | Highlight moments (preview, share, chorus, emotional_peak, …) |

Hooks and highlights use **separate chunks** (already in the advanced chunk registry) so parsers can read them without scanning all sections.

## SECT JSON (version 1)

```json
{
  "version": 1,
  "source": "user",
  "sections": [
    {
      "sectionId": "sect-1",
      "type": "intro",
      "startMs": 0,
      "endMs": 12000,
      "title": "Opening",
      "label": "Opening",
      "confidence": 1,
      "source": "user",
      "colorHint": "violet"
    }
  ]
}
```

### Section types

`intro`, `verse`, `pre_chorus`, `chorus`, `post_chorus`, `bridge`, `drop`, `hook`, `breakdown`, `solo`, `outro`, `silence`, `custom`

### HOOK JSON

```json
{
  "sectionId": "sect-4",
  "startMs": 90000,
  "endMs": 120000,
  "label": "Main hook"
}
```

### HILT JSON

```json
{
  "source": "user",
  "highlights": [
    {
      "startMs": 45000,
      "endMs": 70000,
      "label": "Chorus highlight",
      "useCase": "chorus"
    }
  ]
}
```

## Converter input

**Sections:**

```text
[00:00.00-00:12.00|Intro] Opening
[00:12.00-00:45.00|Verse] Verse 1
[00:45.00-01:10.00|Chorus] First chorus
[00:45.00-01:10.00|Hook] Main hook
```

**Highlights (optional):**

```text
[00:45.00-01:10.00|chorus] Share clip
```

Times use `mm:ss.xx` (centiseconds). Parse errors are shown in the UI; invalid lines are omitted on export.

## Player

- **Song map** panel — section list, current section, jump-to-section, per-section **Loop section**.
- **Highlights** (HILT) — label, use case, time range, duration, **Play**, and **Preview** (for `preview` use case).
- **Smart nav** — skip intro, jump to chorus, replay hook, **Loop hook**, prev/next section.
- **Active range** banner — shows looping or preview clip with **Stop loop**.
- **Waveform** — violet lines for SECT starts; amber bars for HILT ranges; shaded band for active loop/preview.
- **Synced lyrics** — lyric `section` labels display in the lyrics panel only; they do not auto-build SECT.

### Highlight / preview behavior (local player only)

| Action | Behavior |
|--------|----------|
| **Play** highlight | Seek to `startMs`; if `endMs` set, stop at end; else normal play |
| **Preview** | Play `startMs`–`endMs` only, then pause (requires end time) |
| **Loop section** | Repeat section range until **Stop loop** |
| **Loop hook** | Repeat HOOK range (toggle off via **Loop hook** or **Stop loop**) |

Repeat/shuffle playlist modes are unchanged. Loop/preview state resets when changing tracks. No social sharing or clip export in this MVP.

## Demo fixture

`test-fixtures/demo_mp5l_v3_stems.mp5` — Intro → Verse → Chorus → Hook → Outro, LYRC, stems, HOOK, and HILT highlights (`preview`, `emotional_peak`, `share`). **Load karaoke demo** in the player.

## Limitations (MVP)

- No AI section detection, highlight detection, or clip export
- Sections and highlights are manual only
- Playback does not depend on SECT/HOOK/HILT
- Preview/loop uses Web Audio playhead (stem mix uses same clock)
- Open-ended highlights (no `endMs`) only seek — no auto-stop
- Third-party players may ignore these chunks
