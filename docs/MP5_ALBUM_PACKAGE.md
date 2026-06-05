# MP5 Album Package (MVP)

Optional **album / release packaging** for MP5 without changing the core **single-track `.mp5`** format.

## Batch album export (Converter)

**Batch album export** (Converter → Batch) lets you import multiple source audio files, edit album/track metadata in a table, convert to MP5-L, then export:

| Export | Result |
|--------|--------|
| Individual MP5 | One `.mp5` per track (existing batch download) |
| Manifest `.mp5p` | JSON manifest + sidecar `.mp5` files (keep together) |
| Embedded `.mp5p` | One self-contained package (can be very large) |

No AI metadata, no per-file stem editing in batch, no DRM. Browser download limits apply.

After export, a **package summary** offers **Open in Player** (album view), **Save to Library**, and **Download again**.

## Player album UX (v0.14)

Import `.mp5p` in the Player tab to open the **album package view**:

- **Manifest package** — lists sidecar `.mp5` files; calm warning if any are missing.
- **Embedded package** — self-contained; tracks load lazily on play/select.
- Actions: Play album, Add to queue, Save to library, Extract tracks, Dismiss.
- **Saved albums** (Library tab) lists both manifest and embedded packages saved in browser storage.

Browser storage is **local to this device**; clearing site data removes saved albums. No DRM or legal verification.

## Design choice (MVP)

| Approach | Status | Notes |
|----------|--------|--------|
| **A. Manifest package** (`.mp5p` JSON + sibling `.mp5` files) | **Implemented** | Safest MVP; easy to inspect and version |
| **B. Embedded package** (one `.mp5p` blob with multiple tracks) | **Implemented (Alpha)** | See [MP5_EMBEDDED_PACKAGE.md](MP5_EMBEDDED_PACKAGE.md); also from **Batch album export** |

**Single-track `.mp5` remains the normal format.** Players decode one AUDI stream per file. Album mode is an optional layer on top.

## File types

| Extension | Role |
|-----------|------|
| `.mp5` | One track — **core format** (unchanged) |
| `.mp5p` | **Experimental** album manifest (JSON) — references `.mp5` files by relative path |

MIME (informal): `application/vnd.mp5.album+json` or plain `application/json`.

## Relationship to ALBM chunk

The same JSON schema can be stored as an optional **ALBM** fourCC chunk inside a container (advanced tier, not required for playback). The reference app uses standalone **`.mp5p`** manifests for import/export.

Third-party apps may:

- Ignore album packages entirely
- Read only `.mp5` files
- Implement `.mp5p` + sidecar tracks
- Embed ALBM in a wrapper file later

## Manifest schema (`mp5-album-manifest-v1`)

```json
{
  "format": "mp5-album-manifest-v1",
  "version": 1,
  "album": {
    "title": "Album title",
    "artist": "Display artist",
    "albumArtist": "Album artist",
    "year": "2026",
    "releaseDate": "2026-05-20",
    "genre": "Genre",
    "cover": {
      "type": "embedded",
      "mime": "image/jpeg",
      "dataBase64": "..."
    }
  },
  "tracks": [
    {
      "trackId": "unique-id",
      "file": "01-track.mp5",
      "trackNumber": 1,
      "discNumber": 1,
      "title": "Track title",
      "artist": "Track artist",
      "durationMs": 180000,
      "gaplessPrevious": false,
      "gaplessNext": true
    }
  ],
  "credits": "Optional liner notes / credits text",
  "crdt": { "producer": ["Name"], "primaryArtist": ["Artist"] },
  "licn": { "licenseType": "All rights reserved" },
  "iden": { "catalogNumber": "CAT-001" },
  "gaplessDefault": false
}
```

### Track list rules

- **1–256** tracks after validation
- Sorted by `discNumber` then `trackNumber` on import
- `file` must be a relative path **without** `..`, `\`, absolute `/`, or Windows drive letters
- **Duplicate `trackId` or duplicate file basename** → later entries rejected with validation errors
- `durationMs` capped at 24 hours per track
- `trackId` is stable for re-import when the same session created the manifest

### Validation (`validateAlbmPackageManifest` + `auditAlbmPackageManifest`)

| Check | On failure |
|-------|------------|
| `format` / `version` | Manifest rejected |
| Album title required | Manifest rejected |
| Path traversal in `file` or cover path | Entry rejected |
| Duplicate track IDs / file refs | Duplicate entries dropped + error |
| Invalid JSON | Parse error |
| Cover `file` ref (MVP) | Non-fatal audit warning |
| Oversized embedded cover | Audit warning |

### Cover art

- **`embedded`**: base64 image (no `data:` URL prefix)
- **`file`**: relative path e.g. `cover.jpg` (player may not load in MVP — metadata display only)

### Gapless playback

- Per-track `gaplessPrevious` / `gaplessNext` hints for future crossfade/gapless engines
- `gaplessDefault` is album-level preference
- **MVP player** does not change decode; hints are display/metadata only

### Credits / booklet

- `credits` string for simple liner notes
- Optional album-level **`crdt`**, **`licn`**, **`iden`** (same schemas as track chunks) — see [`MP5_CREDITS_RIGHTS.md`](MP5_CREDITS_RIGHTS.md)
- Track-level CRDT/LICN/IDEN in each `.mp5` remain independent
- Full digital booklet (PDF, synced pages) — **future**

## Reference app behavior

### Import

1. Drop **`.mp5p`** together with referenced **`.mp5`** files (or load tracks first, then manifest).
2. Banner explains that **`.mp5p` is a manifest**, not an embedded archive.
3. Manifest is validated; invalid JSON shows an error and does **not** break the player.
4. **Album view** shows title, artist/album artist, year, release date, genre, track count, total duration, cover, **found** vs **missing** file lists.
5. **Add missing .mp5 files** — file picker adds sidecars and re-resolves the manifest.
6. Missing rows stay visible as **Missing** — playback uses only resolved tracks.
7. Optional **`fileSha256`** per track — sidecar status **Verified**, **Hash mismatch**, or **No hash** (see [`MP5_FINGERPRINT_INTEGRITY.md`](MP5_FINGERPRINT_INTEGRITY.md)).

### Create

With **two or more** playable tracks in the playlist:

1. Open **Create album package** in the library column.
2. Set album title, artist, year, genre; preview **track order** with move up/down.
3. See each **referenced filename** before export.
4. Warning: manifest must stay beside sidecar `.mp5` files; embedded archives are future work.
5. **Download .mp5p manifest** — filenames match playlist `file.name` values.

Keep the `.mp5p` file in the **same folder** as the `.mp5` tracks for re-import.

### Saved albums (Library tab)

- **Save album** on the album panel stores the manifest in browser **localStorage** (not IndexedDB tracks).
- **Library → Saved albums** — play (loads matching library tracks by filename), delete.
- Track `.mp5` files must still be saved to the library separately for Play from saved albums.

### Playback

- **Play album** — queues resolved tracks in order and starts the first available track.
- **Add album to queue** — appends resolved tracks without clearing the queue.
- Click a track row to play that track (if present).
- Single **`.mp5`** drops without a manifest behave exactly as before.

## Safety

- JSON size capped at 64 KiB when embedded as ALBM chunk
- Path traversal blocked on `file` and cover `path`
- Strings sanitized (control characters stripped)
- No arbitrary HTML/CSS in manifest

## Demo fixture

`test-fixtures/demo_album_package.mp5p` references:

- `demo_mp5l_v3_tone.mp5`
- `demo_mp5l_v3_stems.mp5`

Synthetic metadata only — **no copyrighted album bundles** in the repo.

Generate:

```bash
pnpm --filter @mp5/container build
node scripts/generate-demo-fixtures.mjs
node scripts/generate-demo-album-package.mjs
```

## Limitations (MVP)

- No embedded multi-track `.mp5p` archive (zip/tar) — manifest + sidecars only
- No cloud sync or album storefront
- No automatic gapless crossfade in the Web Audio player
- Cover `file` references may not load in the player UI
- Saved albums store manifests only in localStorage — not bundled audio (match library tracks by filename)
- ALBM chunk in a single `.mp5` is defined but not exposed in the converter UI

## Implementation

| Area | Location |
|------|----------|
| Schema / validate | `packages/mp5-container/src/albm.ts` |
| Resolve / create / ingest | `apps/web/src/lib/album/` |
| Album UI | `AlbumPackagePanel.tsx` |
| Create UI | `CreateAlbumPackagePanel.tsx` |

See also [`MP5_METADATA_SPEC.md`](MP5_METADATA_SPEC.md), [`MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md).
