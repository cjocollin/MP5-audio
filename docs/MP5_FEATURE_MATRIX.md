# MP5 feature matrix (Alpha v0.9.0)

**Legend:** ✅ implemented · 🧪 tested · 📦 demo fixture · 🔒 stable for Alpha · 🧪 lab/experimental · 📄 docs

| Feature | Impl | Tested | Fixture | Alpha stable | Lab/exp | Docs |
|---------|:----:|:------:|:-------:|:------------:|:-------:|------|
| MP5-L v3 audio (default) | ✅ | ✅ | `demo_mp5l_v3_tone.mp5` | ✅ | | [MP5L.md](MP5L.md) |
| PCM reference codec | ✅ | ✅ | `demo_pcm_reference_tone.mp5` | ✅ | | [MP5_CODEC_SPEC.md](MP5_CODEC_SPEC.md) |
| MP5-C lab codec | ✅ | ✅ | `demo_mp5c_lab_tone.mp5` | | 🧪 | [MP5C_LIMITATIONS.md](MP5C_LIMITATIONS.md) |
| MP5-H hybrid + CORR | ✅ | ✅ | `compatibility/mp5h_with_corr.mp5`* | | 🧪 | [MP5H.md](MP5H.md) |
| Core metadata (META) | ✅ | ✅ | `compatibility/mp5l_metadata_full.mp5`* | ✅ | | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| Cover art (COVR) | ✅ | ✅ | `compatibility/mp5l_with_cover.mp5`* | ✅ | | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| Unsynced lyrics (LYRC) | ✅ | ✅ | export path | ✅ | | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| Synced lyrics (LYRC) | ✅ | ✅ | `demo_mp5l_v3_stems.mp5` | ✅ | | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| Content guidance (EXPL/SAFE/SENS/RECV) | ✅ | ✅ | editor | ✅ | | [MP5_CONTENT_WARNINGS.md](MP5_CONTENT_WARNINGS.md) |
| Mood / vibe (MOOD/VIBE) | ✅ | ✅ | export | ✅ | | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| Specialized app metadata | ✅ | ✅ | editor | ✅ | | [MP5_METADATA_SPEC.md](MP5_METADATA_SPEC.md) |
| Stems STEM/STDA/STDF | ✅ | ✅ | `demo_mp5l_v3_stems.mp5` (stda-v1) | ✅ | Large sets → stdf-v1 | [MP5_STEMS.md](MP5_STEMS.md) |
| Batch stem import | ✅ | ✅ | unit tests | ✅ | | [MP5_STEMS.md](MP5_STEMS.md) |
| Stem normalization | ✅ | ✅ | unit tests | ✅ | | [MP5_STEMS.md](MP5_STEMS.md) |
| Stem mixer (player) | ✅ | ✅ | stems demo | | experimental | [MP5_STEMS.md](MP5_STEMS.md) |
| Karaoke mode | ✅ | ✅ | stems demo | ✅ | | [MP5_STEMS.md](MP5_STEMS.md) |
| Song sections (SECT) | ✅ | ✅ | stems demo | ✅ | | [MP5_SECTIONS.md](MP5_SECTIONS.md) |
| Hooks (HOOK) | ✅ | ✅ | stems demo | ✅ | | [MP5_SECTIONS.md](MP5_SECTIONS.md) |
| Highlights (HILT) | ✅ | ✅ | stems demo | ✅ | | [MP5_SECTIONS.md](MP5_SECTIONS.md) |
| Visual themes (VISU) | ✅ | ✅ | stems demo | ✅ | | [MP5_VISUAL_THEMES.md](MP5_VISUAL_THEMES.md) |
| Album packages (.mp5p) | ✅ | ✅ | `demo_album_package.mp5p` | | experimental | [MP5_ALBUM_PACKAGE.md](MP5_ALBUM_PACKAGE.md) |
| Credits (CRDT) | ✅ | ✅ | export | ✅ | | [MP5_CREDITS_RIGHTS.md](MP5_CREDITS_RIGHTS.md) |
| Rights (LICN) informational | ✅ | ✅ | export | ✅ | | [MP5_CREDITS_RIGHTS.md](MP5_CREDITS_RIGHTS.md) |
| Identifiers (IDEN) | ✅ | ✅ | export | ✅ | | [MP5_CREDITS_RIGHTS.md](MP5_CREDITS_RIGHTS.md) |
| Fingerprints (FING) | ✅ | ✅ | export | ✅ | | [MP5_FINGERPRINT_INTEGRITY.md](MP5_FINGERPRINT_INTEGRITY.md) |
| Integrity hashes (HASH) | ✅ | ✅ | export | ✅ | | [MP5_FINGERPRINT_INTEGRITY.md](MP5_FINGERPRINT_INTEGRITY.md) |
| Local library | ✅ | ✅ | e2e | ✅ | | [CURRENT_MP5_STATUS.md](CURRENT_MP5_STATUS.md) |
| Batch conversion | ✅ | ✅ | e2e | ✅ | MP5-L only | [CURRENT_MP5_STATUS.md](CURRENT_MP5_STATUS.md) |
| PWA / hosted demo | ✅ | ✅ | deploy check | ✅ | | [MP5_DEPLOYMENT_GUIDE.md](MP5_DEPLOYMENT_GUIDE.md) |
| Inspect CLI | ✅ | ✅ | `pnpm inspect:mp5` | ✅ | | [MP5_COMPATIBILITY_POLICY.md](MP5_COMPATIBILITY_POLICY.md) |
| Validate CLI | ✅ | ✅ | `pnpm validate:mp5` | ✅ | | [MP5_COMPATIBILITY_POLICY.md](MP5_COMPATIBILITY_POLICY.md) |
| In-app compatibility summary | ✅ | ✅ | player panel | ✅ | | Format panel |
| AI stem separation | | | | | | **Not planned (Alpha)** |
| DRM | | | | | | **Not implemented** |

\*Generate with `pnpm compatibility:fixtures` (not always committed).

## Known limitations (all features)

- Browser WASM decode — CPU bound
- MP5-C hiss on music material
- MP5-H file size ~1.8× PCM without counting CORR
- Stem mix loads all stems in RAM (cap ~120 MB decoded)
- Batch converter: no stems/metadata editor per file
- `.mp5p`: sidecar paths manual; cover file refs may not load in MVP player
- Validation tools: structural only — no legal/rights verification

## Recommended path for new files

1. Export **MP5-L v3** single track (`.mp5`)
2. Optional chunks as needed (metadata, stems, VISU, …)
3. Validate: `pnpm validate:mp5 file.mp5 --profile rich`
4. Inspect: `pnpm inspect:mp5 file.mp5`
