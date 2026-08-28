# MP5 Feature Matrix

**Version:** MP5 Audio v0.30.1-beta
**Status:** Public Beta summary

For the detailed compatibility table, see [MP5_COMPATIBILITY_MATRIX.md](MP5_COMPATIBILITY_MATRIX.md).

| Feature | Status | Notes |
|---------|--------|-------|
| MP5-L v4 convert/play | Public Beta | Recommended lossless path; packed Rice + 4-mode stereo |
| MP5-C | Lab-only | May hiss; not default |
| MP5-C2 (vNext) | Lab/advanced | Lossless / bit-exact; Converter gated; protect-scale 1.5; ~1.07x MP5-L size (no size win) |
| MP5-H | Experimental | Large hybrid mode; not default |
| PCM | Reference/debug | Fallback and tests |
| Metadata / cover / lyrics | Public Beta | Optional; never required for playback |
| Content guidance | Public Beta | Informational only |
| VISU themes | Public Beta UI metadata | Song colors plus audio-reactive Now Playing bars; reduced-motion safe |
| Manual stems | Experimental | User/artist-provided; no AI stem separation |
| Batch stem import | Experimental | Uses converter decode path |
| Album packages `.mp5p` | Experimental | Manifest and embedded modes; opt-in gapless playback |
| Native player integration | Public Beta UI | Installed file launch plus Media Session transport actions |
| Converter A/B audition | Public Beta UI | Synchronized source PCM versus exported MP5 |
| Local library | Public Beta UI | Browser-local storage, integrity verification, and folder backup |
| Inspect/validate CLI | Public Beta toolkit | `inspect:mp5`, `validate:mp5`, `validate:mp5p` |
| Telemetry/upload/cloud sync | Not included | No such behavior in reference app |
