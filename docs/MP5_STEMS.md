# MP5 Stems (optional STEM chunk — MVP)

**Version:** MP5 Audio v0.10.5-alpha · Chunk registry: [`MP5_CHUNK_REGISTRY.md`](MP5_CHUNK_REGISTRY.md)

Stems are **optional**. Every `.mp5` file must remain playable from the **AUDI** (full mix) chunk alone. Players that do not implement stems ignore **STEM** / **STDA** / **STDF** and behave as today.

## Policy

- **No AI stem separation** — users provide stem files manually (WAV, FLAC, MP3, M4A, OGG via the converter decode path).
- **No MP5-C for stems by default** — stems encode as **MP5-L v3** when WASM is available; PCM reference fallback if not.
- **Full mix required** — `fullMixInAudi: true` in the STEM manifest; AUDI is the default playback path.
- **Experimental MVP** — stem mixing in the web player is **lazy and selective** (v0.10.3+), with **background worker decode** (v0.10.4+); full mix in AUDI is always instant.

## Chunks

| FourCC | Role |
|--------|------|
| **AUDI** | Required full mix (default playback) |
| **STEM** | JSON manifest — per-stem metadata |
| **STDA** | Single-chunk stem audio (small / legacy; length-prefixed frames) |
| **STDF** | Segmented stem data fragments (large embedded stem sets; v1) |

### STEM manifest (JSON, version 1)

Each stem entry includes:

| Field | Description |
|-------|-------------|
| `stemId` | Stable ID |
| `stemName` | Display name |
| `stemType` | Taxonomy (see below) |
| `codecId` | Container codec for stem frame (MP5-L or PCM) |
| `sampleRate` | Hz |
| `channels` | Channel count |
| `durationSamples` | Samples per channel |
| `byteLength` | Payload size |
| `checksum` | CRC32 hex of frame data |
| `defaultVolume` | 0–2 (default 1) |
| `soloMuteCapable` | UI may offer mute/solo (default true) |
| `requiredForPlayback` | Default **false** — stems never block AUDI playback |
| `explicitContent` | Optional content flag |
| `cleanAlternateStemId` | Optional linked stem |
| `dataOffset` / `dataLength` | Logical byte range in stem frame data |
| `fragmentCount` | STDF only — number of STDF chunks for this stem |
| `storageMode` (manifest) | `stda-v1` or `stdf-v1` |

### STDA binary layout (stda-v1)

```
u8 version (=1)
u8 stem_count
repeat stem_count:
  u32 frame_length
  u8[frame_length]  // MP5-L v3 or PCM bitstream (single frame)
```

### STDF fragment layout (stdf-v1)

Used when embedded stem data is too large for one **STDA** chunk (container max **64 MiB** per chunk — not raised for safety).

```
u8 version (=1)
u8 stem_id_length
u8[stem_id_length] stem_id (UTF-8)
u16 part_index
u16 part_count
u32 payload_length
u32 payload_crc32
u8[payload_length]  // slice of stem frame bitstream
```

Multiple **STDF** chunks may appear in one file (one fragment per chunk). **STEM** manifest `storageMode: "stdf-v1"` and per-stem `fragmentCount` describe reconstruction.

### Recommended `stemType` values

`full_mix`, `lead_vocals`, `background_vocals`, `drums`, `bass`, `guitar`, `piano`, `synths`, `strings`, `percussion`, `instrumental`, `acapella`, `effects`, `custom`

## Converter

1. Export full mix as usual (MP5-L v3 default).
2. Optional **Stems** section: import **one or many** stem files at once (**Import stems** or drag-and-drop). Supported sources use the same decode path as the converter (WAV, FLAC, MP3, M4A, OGG). Stem **name** defaults to the filename; **type** is guessed from the filename (editable).
3. **Batch import summary** shows imported/skipped counts, unsupported files, duplicate filenames, guessed types, and alignment status vs the full mix.
4. Validation: sample rate must match mix before export; channel/duration mismatches warn with **Normalize stems to match full mix** (applies to all stems).
5. **Stem normalization (v0.8.1+):** resample to the mix rate (e.g. 48000 → 44100 Hz), align channels (mono ↔ stereo), pad short stems with silence, trim long stems (small mismatches &lt; 500 ms by default; large trims confirm first). Optional **pad full mix** when all stems are consistently longer. Original stem PCM is kept in memory until export — **not** AI alignment.
6. **Bulk actions:** normalize all, remove all, set all volumes to 100%. Large batch imports show memory/time guardrails.
7. Export merges **STEM** + **STDA** (small sets) or **STEM** + multiple **STDF** fragments (large sets) — auto-selected when combined stem data would exceed the 64 MiB per-chunk limit. Fragment size ~12 MiB. MP5-L v3 for stems when WASM is ready.

Stems should ideally come from the **same session/export** as the full mix; normalization is a helper for rate/duration mismatches only.

## Player playback (v0.10.5-alpha)

**v0.10.5 fix:** STDF worker jobs now include `payloadCrc32` / `payloadLength` on every fragment wire message, and worker payloads always **copy** bytes before `postMessage` transfer so parsed file fragments are not detached. This fixes false “CRC mismatch on part 1/2” after solo/prepare on real STDF files (e.g. Pity Party).

## Player playback (v0.10.4-alpha)

Large embedded stem sets (**STDF**) must not freeze the browser:

- **Full mix (AUDI)** — always the default; no stem decode required to play (main thread).
- **Stem list** — metadata shows immediately; stems are **not** all decoded on file open.
- **Background worker** — solo, prepare selected, and karaoke stem prep run in a **Web Worker** when available: STDF fragment transfer per stem (not the whole file), WASM MP5-L decode initialized once per worker, PCM returned via transferable `ArrayBuffer`s.
- **Progress UI** — phase labels (loading fragments / reconstructing / decoding / ready), stem index/total, optional percent, cancel.
- **Fallback** — if Worker or worker WASM fails, the app uses the prior yielded main-thread path and shows: *Background stem decoding is unavailable. Large stems may feel slower.*
- **Solo** — decode and play **one** stem at a time.
- **Prepare selected** — decode only checked stems for mixing (progress + cancel).
- **Karaoke** — **instrumental-only** decode when an instrumental stem exists; otherwise prepare non-vocal stems only (may take time).
- **Memory** — per-stem decode cache with unload; browser limits still apply; workers improve **responsiveness**, not file size.
- **Synced lyrics** — follow the Web Audio playback clock (~15 fps UI), not stem-prep state.

### Remaining lag (honest profile)

| Phase | Thread | Notes |
|-------|--------|-------|
| File drop / `parseMp5` | Main | Full container read + HASH still on main thread (~1 s for 270 MB in Node; browser can be slower). |
| STDF fragment grouping | Main | Cheap map build at stem panel parse. |
| Stem reconstruct + MP5-L decode | **Worker** (or main fallback) | Per selected/solo/karaoke stem only. |
| Waveform / song map | Main | Can add cost on open; unrelated to stem worker. |
| Lyrics active line | Main | Clock-based ~15 fps; should stay smooth during worker prep. |

See [`MP5_STEM_WORKER_PROFILE.md`](MP5_STEM_WORKER_PROFILE.md) for the v0.10.4 hotfix profile notes.

## Karaoke mode (player)

When a file has **synced LYRC** lines and compatible stems:

- **Instrumental** stem — karaoke decodes **only** the instrumental stem (fast path).
- **Vocal stems** (`lead_vocals`, `background_vocals`, `acapella`) — karaoke prepares **non-vocal** stems when no instrumental is present (progressive; not all stems at once).

Karaoke mode is opt-in, enables **stem mix**, and does not change the AUDI decode path when stem mix is off. Without stems, synced lyrics still highlight during playback. No AI vocal removal.

## Player

- **Default:** AUDI full mix — unchanged MP5-L/PCM decode path.
- **Stems panel:** explains optional stems, full-mix fallback, third-party ignore behavior, and opt-in mixing.
- **Stem mix (opt-in):** decode each stem into RAM, sync Web Audio playback, per-stem volume / mute / solo.
- **Download:** embedded stem frame with safe filename (`Name_type_mp5l-v3.stem-frame`) — not a full `.mp5` container.

## Demo fixture

`test-fixtures/demo_mp5l_v3_stems.mp5` — synthetic full mix plus **drums**, **bass**, and **lead_vocals** stems (MP5-L v3). Generated by `pnpm fixtures:generate`. In the app: **Load stems demo** on Player or Converter demo actions.

Validation:

```bash
node scripts/validate-stem-fixture.mjs   # also run via pnpm alpha:check
```

Checks: STEM + **STDA** (small demo) or **STDF** fragments (large sets), checksums, offsets, `fullMixInAudi`, AUDI decode, per-stem WASM decode, corrupt checksum rejected. CLI: `pnpm inspect:mp5 <file>` shows `stda-v1` vs `stdf-v1` and STDF fragment count.

## Memory guardrails (web player)

Selected / solo stem decode only (see `apps/web/src/lib/stems/stemLimits.ts`):

| Guard | Value |
|-------|--------|
| Max stems in manifest | 32 |
| Large embedded file hint | > ~48 MB total stem data in file |
| Warn selected decode RAM | ~96 MB |
| Block selected decode RAM | ~384 MB |
| Block single stem decode | ~128 MB |

If a **prepare** action exceeds limits, it is blocked with a calm message; **full mix playback still works**. Preparing every stem at once on huge files is not supported — use solo or selected stems.

## Limitations (MVP)

- No automatic stem generation or alignment editing
- No separate per-stem seek tables
- No live all-stem mix on 200+ MB embedded stem sets without preparation time
- Maximum 32 stems in manifest (parser cap)
- `full_mix` stem type in taxonomy is for labeling; playable full mix remains AUDI only

See also [`MP5_METADATA_SPEC.md`](MP5_METADATA_SPEC.md) and [`MP5_ADVANCED_FEATURES.md`](MP5_ADVANCED_FEATURES.md).
