# MP5 Album Package

**Version:** MP5 Audio v0.29.0-beta  
**Status:** Experimental Public Beta package format

Album packaging is optional and does not change the core single-track `.mp5` format. Single-track `.mp5` playback remains the baseline.

## Package Types

| Type | Extension | Status | Notes |
|------|-----------|--------|-------|
| Manifest package | `.mp5p` JSON | Experimental | References sidecar `.mp5` files; keep files together |
| Embedded package | `.mp5p` binary (`MP5P`) | Experimental | Self-contained; can be large and memory-heavy |
| `ALBM` chunk | `.mp5` optional chunk | Optional metadata | In-file album manifest metadata; never required for playback |

## Converter Behavior

Batch Album Builder can export:

- Individual `.mp5` files.
- Manifest `.mp5p` plus sidecar `.mp5` files.
- Embedded `.mp5p` self-contained package.

Exports use MP5-L v4 by default. No DRM, legal verification, telemetry, upload, cloud sync, or AI metadata/stem generation is added.

## Manifest Schema

Manifest packages use `mp5-album-manifest-v1`:

```json
{
  "format": "mp5-album-manifest-v1",
  "version": 1,
  "album": {
    "title": "Album title",
    "artist": "Display artist",
    "albumArtist": "Album artist",
    "year": "2026"
  },
  "tracks": [
    {
      "trackId": "track-1",
      "file": "01-track.mp5",
      "trackNumber": 1,
      "discNumber": 1,
      "title": "Track title",
      "artist": "Track artist",
      "durationMs": 180000
    }
  ]
}
```

## Validation Rules

| Rule | Limit / behavior |
|------|------------------|
| Track count | 1 to 256 tracks |
| Manifest JSON | 8 MiB cap before parse |
| Track duration | 24 hours max per track |
| Sidecar paths | Relative only; no `..`, absolute paths, backslashes, or drive letters |
| Duplicate track IDs/files | Rejected or reported as validation errors |
| Cover art | Embedded cover warning when large |

## Player Behavior

- Manifest packages list referenced sidecar `.mp5` files and warn when files are missing.
- Embedded packages show album metadata without decoding every track up front.
- **Play album** queues tracks and loads embedded bytes on demand.
- Save-to-library is browser-local storage only.

## CLI

```bash
pnpm validate:mp5p test-fixtures/demo_album_package.mp5p --dir test-fixtures --profile package
pnpm validate:mp5p test-fixtures/demo_embedded_album_package.mp5p --profile package
pnpm inspect:mp5 test-fixtures/demo_embedded_album_package.mp5p
```

## Fixtures

Synthetic fixtures only:

- `test-fixtures/demo_album_package.mp5p`
- `test-fixtures/demo_embedded_album_package.mp5p`

See [MP5_FIXTURE_CATALOG.md](MP5_FIXTURE_CATALOG.md).

## Related Docs

- [Embedded package](MP5_EMBEDDED_PACKAGE.md)
- [Chunk registry](MP5_CHUNK_REGISTRY.md)
- [Compatibility matrix](MP5_COMPATIBILITY_MATRIX.md)
