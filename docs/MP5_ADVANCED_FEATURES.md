# MP5 Advanced Features (optional)

## STEM chunk

Flexible artist-defined stems. Recommended taxonomy + custom labels.

### Taxonomy (examples)

lead_vocals, background_vocals, drums, bass, guitar, piano, instrumental, acapella, clean_vocals, custom, …

### Per-stem metadata

stemId, stemName, stemType, codecId, durationSamples, sampleRate, channels, defaultVolume, soloMuteCapable, requiredForPlayback (default false), explicitContent, cleanAlternateStemId, checksum, dataRef.

### Validation (converter)

When muxing multiple stems: aligned duration, sample rate, channels.

### Player

Default: master AUDI. Optional: stem mixer, karaoke, instrumental, acapella, clean. Fallback to AUDI if device cannot mix many stems.

## Other advanced chunks

LAYS, MIXR, KARA, SOLO, HOOK, HILT, VISU, CVRA, ARTS, CRDT, LICN, SHAR, CLIP, NOTE, MEMR, ACCS, QUAL, REPR, AIPR, VERS, ALBM — see MP5_ROADMAP maturity matrix.

NOTE/MEMR: local/private by default.
