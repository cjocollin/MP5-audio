# MP5 Embedded Album Package

**Version:** MP5 Audio v0.29.0-beta  
**Status:** Experimental Public Beta package format

Embedded `.mp5p` packages use magic `MP5P`, manifest format `mp5-album-embedded-v1`, a track directory, and fragmented embedded `.mp5` payloads. v0.29.0-beta does not change MP5P semantics.

## Binary Package Limits

| Limit | Value |
|-------|-------|
| Default fragment payload | 12 MiB |
| Max fragment payload | 16 MiB |
| Max directory bytes | 16 MiB |
| Max track id length | 128 chars |
| Max logical filename length | 512 chars |
| Large package warning | > 512 MiB |
| Large track warning | > 256 MiB |

## Player UX

- Import embedded `.mp5p` to open the album package view.
- Cover and manifest metadata are read without decoding every track up front.
- **Play album** queues all tracks using lightweight placeholders.
- Embedded track bytes load on demand when a track is selected or played.
- Extract saves individual `.mp5` files with safe filenames.
- Save to Library stores the full package in browser storage after size confirmation.

## Export Validation

- Preflight blocks invalid package inputs and warns on large/heavy exports.
- Post-export validation re-indexes the package.
- Packages under the browser threshold can verify per-fragment CRC in-tab.
- Very large packages may defer deep validation to CLI:

```bash
pnpm validate:mp5p <file.mp5p> --profile package
```

## Manifest Versus Embedded

| Mode | Benefit | Tradeoff |
|------|---------|----------|
| Manifest `.mp5p` | Small and inspectable | Sidecar `.mp5` files must travel with it |
| Embedded `.mp5p` | Self-contained | Larger and more memory/storage intensive |

Keep original source files backed up. MP5P does not provide DRM, legal proof, telemetry, upload, or cloud sync.

See [MP5_ALBUM_PACKAGE.md](MP5_ALBUM_PACKAGE.md).
