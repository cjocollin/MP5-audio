# MP5 Public Beta Release Notes

**Current release:** MP5 Audio v0.29.0-beta  
**Hosted demo:** https://mp5-audio.vercel.app  
**Last updated:** 2026-07-18

## What Is MP5?

MP5 is an experimental, browser-based open-source audio format, container, codec, converter, and player. It packages audio with optional metadata such as cover art, lyrics, sections, stems, visual themes, integrity metadata, and album packages.

MP5 is Public Beta, not production-ready for archival or legal use.

## v0.29.0-beta Highlights

- **Lab MDCT loud path** (`mp5c3` / `TAG_MDCT`) with FFT Type-IV for practical WASM lab modes.
- Real-track MDCT validate at protect 1.5: hiss risk **low**, High ~0.214× / Extreme ~0.268× PCM.
- Default vNext loud path and MP5-L batch/export unchanged; MDCT remains opt-in lab.
- MP5-C v5.1 quant unchanged. No mainstream-codec claims.

## What Works

| Area | Status |
|------|--------|
| MP5-L v3 | Recommended lossless convert and play |
| Web player | Play, pause, seek, volume, queue, loops |
| Converter | WAV/FLAC/MP3/M4A/OGG to MP5-L using browser-local processing |
| Metadata | Cover, lyrics, content guidance, VISU themes, credits/rights notes |
| Stems/karaoke | Experimental stem mix and synced lyrics; user/artist-provided stems only |
| Album packages | Manifest and embedded `.mp5p`; experimental |
| Local library | Browser storage on this device only |
| Hosted demos | Synthetic MP5-L, karaoke, and embedded album demos |

## Known Limitations

- Experimental Public Beta.
- Does not claim to beat MP3, AAC, Opus, or FLAC.
- No DRM, no legal proof, no AI stem separation, no telemetry, no upload, and no cloud sync.
- MP5-C is lab-only and may hiss.
- MP5-H is large/experimental and not default.
- Large `.mp5p` packages, long files, or many stems can stress browser memory.
- First load can be slow because WASM and FFmpeg assets are large.

See [MP5_KNOWN_ISSUES.md](./MP5_KNOWN_ISSUES.md).

## How To Test

1. Open https://mp5-audio.vercel.app.
2. Confirm the badge reads `MP5 Public Beta - v0.29.0-beta`.
3. Try the MP5-L demo, karaoke demo, and embedded album demo.
4. Open Converter and Batch.
5. Optional: convert your own local file with MP5-L v4 default.
6. Copy diagnostics from Settings if reporting a bug.

## Report Bugs Or Feedback

1. Use **Settings -> Report a bug / Give feedback** or open [GitHub Issues](https://github.com/cjocollin/MP5-audio/issues/new/choose).
2. Paste **Settings -> Diagnostics -> Copy diagnostics** if useful.
3. Include MP5 version, browser/OS, file type (`.mp5` or `.mp5p`), and steps to reproduce.

Do not upload copyrighted or private audio unless you have rights and choose to share it.

## Related Docs

- [Current status](./CURRENT_MP5_STATUS.md)
- [Beta readiness](./MP5_BETA_READINESS.md)
- [Hosted demo](./MP5_HOSTED_DEMO.md)
- [Developer quickstart](./MP5_DEVELOPER_QUICKSTART.md)
- [Compatibility matrix](./MP5_COMPATIBILITY_MATRIX.md)
- [Fixture catalog](./MP5_FIXTURE_CATALOG.md)
- [Changelog](../CHANGELOG.md)
