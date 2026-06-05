# MP5 embedded album package (prototype Alpha)

**Version:** MP5 Audio v0.15.1-alpha

Embedded `.mp5p` uses magic `MP5P`, manifest format `mp5-album-embedded-v1`, track directory, and fragmented embedded `.mp5` payloads (12 MiB default, 16 MiB max per fragment, CRC32 + per-track SHA-256).

## Player UX (v0.14)

- Import embedded `.mp5p` → **album package view** with cover, metadata, size, and integrity.
- **Play album** queues the full track list immediately; embedded bytes load **on demand** when a track is selected or played (not all parsed upfront).
- **Cover:** album manifest cover when present; otherwise first-track cover from a small prefix read (no full 600MB+ package read).
- **Durations:** manifest `durationMs` when valid; HEAD fallback when missing.
- **Extract** embedded tracks as `01 - Title.mp5` (staggered if many).
- **Save to Library** stores the full package in browser storage (IndexedDB) with size confirmation.
- **Now Playing** shows album title and “From embedded album” when playing from a package.

Manifest `.mp5p` (JSON + sidecars) is unchanged.

**Batch album export** in the Converter can build embedded `.mp5p` directly from a completed batch queue (synthetic sources only in tests).

See [MP5_ALBUM_PACKAGE.md](MP5_ALBUM_PACKAGE.md).
