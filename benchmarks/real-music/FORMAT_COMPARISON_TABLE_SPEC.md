# Format comparison table — About page spec

**Audience:** Public About page (`AboutMp5Panel` — UI agent owns the React).  
**Data module:** `apps/web/src/lib/formatComparison.ts`  
**Status:** Qualitative copy frozen; measured size fields are placeholders (`{{ratioVsWav}}`) until the measurement agent fills them.  
**Version context:** MP5 Audio Public Beta (experimental).

---

## Honesty constraints (non-negotiable)

1. **Never claim MP5 beats** MP3, AAC, Opus, or FLAC (or WAV “quality”).
2. **Distinguish types:** WAV = uncompressed reference; FLAC + MP5-L = lossless; MP3 = lossy.
3. **WAV is not better listening quality** than FLAC/MP5-L when all three are lossless from the same PCM — it is the **size baseline**.
4. **MP5 is experimental Public Beta** — research prototype / smart container, not a finished product codec.
5. **MP5-C is not a peer row.** Lab-only footnote only (may hiss; not for normal listening).
6. **No invented compression %.** Size/ratio cells stay `{{ratioVsWav}}` / `null` until measured.
7. Align with About panel lead: *Does not claim to beat MP3, AAC, Opus, or FLAC.*

Sources: `AboutMp5Panel.tsx`, `docs/MP5_CODEC_STATUS.md`, `docs/MP5_FORMAT_SPEC.md`, `docs/MP5_PUBLIC_DEMO_COPY.md`, `benchmarks/real-music/MP5L_COMPRESSION.md`, `COMPRESSION_BASELINE_2026-07-20.md`.

---

## Columns (fair public set)

| Key | Label | Content rules |
|-----|--------|----------------|
| `format` | Format | Display name only. |
| `type` | Type | Uncompressed / Lossless / Lossy. |
| `typicalUse` | Typical use | Short, non-marketing. |
| `compression` | Compression | **Qualitative only** (no fake %). |
| `ratioVsWav` | Size vs WAV | Measured: size ÷ same-source WAV. Placeholder `{{ratioVsWav}}` until filled. WAV = `1.00×`. |
| `bitExact` | Bit-exact? | Whether decoded PCM matches source sample-for-sample. |
| `browserSupport` | Browser / playback | Honest native vs app/WASM notes. |
| `projectStance` | MP5 project stance | Positioning + honesty for this project. |

**Rejected as peer columns (misleading):** “Quality score”, “Better than…”, “Beats FLAC”, single “best format” rank, MP5-C size claims next to MP3.

**Optional internal-only (not required on About):** `ratioVsFlac5` for MP5-L A/B vs FFmpeg `flac -5` — informational; **never** label as “beats FLAC” on the public page.

---

## Rows

| Order | id | Format | Peer? |
|------:|----|--------|-------|
| 1 | `wav` | WAV (PCM) | Yes — uncompressed reference |
| 2 | `flac` | FLAC | Yes — industry lossless |
| 3 | `mp3` | MP3 | Yes — lossy size/compatibility only |
| 4 | `mp5l` | MP5-L (v4) | Yes — recommended MP5 Public Beta path |

**Not peer rows:** MP5-C, MP5-C2, MP5-H, AAC, Opus (mention AAC/Opus only in honesty “does not beat…” copy if needed).

---

## Cell copy (qualitative)

### WAV (PCM)

| Column | Copy |
|--------|------|
| Type | Uncompressed |
| Typical use | Exchange, editing, measurement reference |
| Compression | None — stores raw PCM samples (plus a small header). |
| Size vs WAV | `1.00×` (by definition) |
| Bit-exact? | Reference (identity) |
| Browser / playback | Universal in browsers via Web Audio / decode of PCM WAV. |
| Project stance | Size baseline for this table. Not “higher quality” than FLAC or MP5-L when all three are lossless from the same source. |

### FLAC

| Column | Copy |
|--------|------|
| Type | Lossless |
| Typical use | Archival, distribution, open lossless playback |
| Compression | Mature lossless entropy coding. Typically much smaller than WAV; industry default for open lossless. |
| Size vs WAV | `{{ratioVsWav}}` — TODO measurement (FFmpeg flac -compression_level 5 from same WAV) |
| Bit-exact? | Yes (same PCM source) |
| Browser / playback | Native decode varies by browser; widely supported via libraries / OS players. |
| Project stance | Industry lossless peer. MP5 does not claim to beat FLAC. Listening quality matches WAV/MP5-L when decoded from the same master. |

### MP3

| Column | Copy |
|--------|------|
| Type | Lossy |
| Typical use | Compatibility, streaming, portable playback |
| Compression | Lossy perceptual coding. Far smaller than lossless formats by discarding audio — not a fair “quality” peer to WAV/FLAC/MP5-L. |
| Size vs WAV | `{{ratioVsWav}}` — TODO measurement (320 kbps from same WAV) |
| Bit-exact? | No |
| Browser / playback | Near-universal native browser and device support. |
| Project stance | Lossy size/compatibility peer only. MP5 does not claim to beat MP3 (or AAC/Opus) on size or quality. |

### MP5-L (v4)

| Column | Copy |
|--------|------|
| Type | Lossless |
| Typical use | MP5 Public Beta default listening / batch export |
| Compression | Experimental lossless (packed Rice + multi-mode stereo). Modest compression vs raw PCM; lands between WAV and FLAC-class sizes — not a claim to beat FLAC. |
| Size vs WAV | `{{ratioVsWav}}` — TODO from existing MP5-L exports (same sources) |
| Bit-exact? | Yes (bit-exact) |
| Browser / playback | Requires the MP5 web app / WASM decoder (not a native browser codec). |
| Project stance | Recommended MP5 path in this Public Beta. Experimental smart container — does not claim to beat MP3, AAC, Opus, or FLAC. |

---

## Footnotes (About page)

### Honesty lead

> MP5 is an experimental Public Beta. It does not claim to beat MP3, AAC, Opus, or FLAC. WAV is the uncompressed size reference — not a higher listening-quality tier than FLAC or MP5-L when all are lossless from the same source.

### Lossless parity

> When WAV, FLAC, and MP5-L are produced from the same PCM, decoded audio matches sample-for-sample. File size differs; listening quality does not.

### MP3 context

> MP3 at 320 kbps is a lossy encode. Smaller files reflect discarded audio, not a win over lossless formats.

### Lab-only (not a table row)

> Classic MP5-C (legacy, CodecId 1), MP5-C2, and hybrid MP5-H are research paths — not peer rows here. Classic MP5-C may add audible hiss and is lab-only; it is not recommended for normal listening or demos unless you are explicitly showing lab limits. MP5-C2 is bit-exact lossless but lands near MP5-L size, so it stays lab-gated rather than being offered as a peer.

### How we measured

> How we measured: Starting from the same FLAC masters in the local real-music test set, we decode to WAV PCM (size reference), encode MP3 at 320 kbps with the project’s measurement toolchain, and compare file sizes to existing MP5-L exports from that folder. Ratios are size ÷ WAV for identical PCM. Lossy MP3 is shown for size context only — it is not bit-exact and is not a quality peer to the lossless rows. Corpus and absolute bytes are local/developer-machine measurements; no copyrighted audio is committed to the repo. Fill `{{ratioVsWav}}` (and optional FLAC A/B) from the measurement agent before shipping numbers.

---

## Measurement agent contract

Fill `FormatMeasuredSizes` on each non-WAV row in `formatComparison.ts`:

| Field | Meaning |
|-------|---------|
| `status` | `"measured"` when numbers are real |
| `sizeBytes` | Absolute bytes (document whether median, mean, or single-track) |
| `ratioVsWav` | `sizeBytes / wavSizeBytes` |
| `ratioVsWavLabel` | e.g. `0.62×` (replace `{{ratioVsWav}}`) |
| `ratioVsFlac5` | Optional, MP5-L only; do not surface as a win claim |
| `note` | Corpus N, encoder presets, date |

**Methodology (must match footnote):**

1. Same FLAC sources → WAV PCM + MP3 320 kbps + existing MP5-L exports from the test folder.  
2. Prefer file sizes already produced for the corpus over re-encoding MP5 if exports are trusted bit-exact.  
3. Do **not** mix stem payloads into main-track size claims (`MP5_CODEC_STATUS.md`).  
4. Do **not** publish FLAC A/B as “beats FLAC” even if `ratioVsFlac5 < 1`.

Formal held-out FLAC gate docs live in `MP5L_COMPRESSION.md` (separate from this About size table). About page uses **same-source vs WAV** for public fairness.

---

## UI agent notes

- Import `FORMAT_COMPARISON_TABLE` (or rows + footnotes) from `apps/web/src/lib/formatComparison.ts`.
- Do **not** invent numbers if `formatComparisonMeasurementsPending()` is true — show qualitative compression + `{{ratioVsWav}}` or “pending”.
- Keep the existing About honesty line; this table must not soften it.
- Do not add MP5-C as a fifth peer row.

---

## Design rationale (short)

| Choice | Why |
|--------|-----|
| WAV row | Honest size denominator; prevents “WAV = best quality” confusion via stance + footnotes. |
| MP3 row | Users compare to MP3; showing it as **lossy** prevents false quality rankings. |
| MP5-L only for MP5 | Matches recommended default; C/H/C2 stay lab footnotes. |
| Separate qualitative vs measured columns | Stops placeholder ratios from looking like marketing claims. |
| “Size vs WAV” not “efficiency score” | Neutral metric; smaller ≠ better when type is lossy. |
