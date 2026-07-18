# MP5 Feature Matrix

**Version:** MP5 Audio v0.27.0-beta  
**Status:** Public Beta summary

For the detailed compatibility table, see [MP5_COMPATIBILITY_MATRIX.md](MP5_COMPATIBILITY_MATRIX.md).

| Feature | Status | Notes |
|---------|--------|-------|
| MP5-L v3 convert/play | Public Beta | Recommended lossless path; packed Rice + 4-mode stereo |
| MP5-C | Lab-only | May hiss; not default |
| MP5-C2 (vNext) | Lab/advanced | Quiet-lossless hybrid; Converter gated; protect-scale 1.5 |
| MP5-H | Experimental | Large hybrid mode; not default |
| PCM | Reference/debug | Fallback and tests |
| Metadata / cover / lyrics | Public Beta | Optional; never required for playback |
| Content guidance | Public Beta | Informational only |
| VISU themes | Public Beta UI metadata | Contained to player visuals |
| Manual stems | Experimental | User/artist-provided; no AI stem separation |
| Batch stem import | Experimental | Uses converter decode path |
| Album packages `.mp5p` | Experimental | Manifest and embedded modes |
| Local library | Public Beta UI | Browser-local storage only |
| Inspect/validate CLI | Public Beta toolkit | `inspect:mp5`, `validate:mp5`, `validate:mp5p` |
| Telemetry/upload/cloud sync | Not included | No such behavior in reference app |
