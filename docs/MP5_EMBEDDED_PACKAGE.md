# MP5 embedded album package (prototype Alpha)

**Version:** MP5 Audio v0.13.0-alpha

Embedded `.mp5p` uses magic `MP5P`, manifest format `mp5-album-embedded-v1`, track directory, and fragmented embedded `.mp5` payloads (12 MiB default, 16 MiB max per fragment, CRC32 + per-track SHA-256).

Manifest `.mp5p` (JSON + sidecars) is unchanged.

**Batch album export** in the Converter can build embedded `.mp5p` directly from a completed batch queue (synthetic sources only in tests).

See [MP5_ALBUM_PACKAGE.md](MP5_ALBUM_PACKAGE.md).
