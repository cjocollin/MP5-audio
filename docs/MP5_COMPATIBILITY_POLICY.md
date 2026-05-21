# MP5 compatibility policy (Alpha)

**Version:** MP5 Audio v0.9.0-alpha · **Scope:** container, chunks, codecs, tooling

MP5 is an experimental format. This policy describes how parsers, writers, and tools should behave during **Alpha** and what may change before **Beta**.

## Principles

1. **Full mix first** — `AUDI` + `HEAD` are required; playback must work without any optional chunk.
2. **Unknown optional chunks are safe to ignore** — forward-compatible readers skip unrecognized FourCCs (with CRC skip on mismatch for optional tiers).
3. **No DRM** — MP5 does not implement encryption, license enforcement, or playback blocking based on rights metadata.
4. **Rights metadata is informational** — `LICN`, credits, and identifiers describe intent only; they are not legal verification.
5. **No competitive codec claims** — MP5 does not claim to beat MP3, AAC, Opus, or FLAC.

## Container version

| Item | Alpha policy |
|------|----------------|
| File magic | `MP5A` (bytes `0x4D503541`) |
| Container version | Implicit v1 — no separate container version field in HEAD today |
| Max file size | Enforced in parser (`MAX_FILE_SIZE`) |
| Max chunks | Enforced (`MAX_CHUNKS`) |
| Chunk header | 16-byte header: FourCC, size, flags, CRC32 |

**Beta expectation:** container version field or manifest may be added; Alpha files remain parseable with warnings.

## Required chunks

| FourCC | Policy |
|--------|--------|
| **HEAD** | Required — codec, rate, channels, duration |
| **AUDI** | Required — at least one audio frame |

Missing required chunks → **not playable** (`playable` validation profile fails).

## Optional chunk tiers

| Tier | Behavior on CRC error | Behavior if unknown to decoder |
|------|------------------------|--------------------------------|
| Core typed (META, COVR, SEEK, WAVE, INFO, CORR) | Fatal | N/A — parsed into typed fields |
| Warning (EXPL, SAFE, RECV, SENS) | Skip + warning | Decode when implemented |
| AI / feature (LYRC, STEM, SECT, …) | Skip + warning | Decode when implemented |
| Advanced registry-only | Skip + warning | Stored in `optional` map only |
| Moonshot | Skip + warning | Stored in `optional` map only |
| Unknown FourCC | Skip + warning if flagged optional | Stored in `optional` map |

## Chunk version policy

- JSON chunks use an internal `version` field where defined (e.g. STEM v1, LYRC, VISU, FING, HASH).
- Version bumps should remain backward-readable for one prior version during Beta prep.
- Unsupported JSON version → decode returns null or validation warning; must not break AUDI playback.

## Codec policy (unchanged in v0.9)

| Codec | Alpha role |
|-------|------------|
| **MP5-L v3** | Default / recommended export and playback |
| **PCM** | Reference / debug |
| **MP5-C** | Lab-only — may hiss; label as experimental in tools |
| **MP5-H** | Hybrid — requires **CORR** for clean lossless; large; not default |

**Codec version labels** (inspect tooling):

- MP5-L: v2 legacy, **v3 recommended**
- MP5-C: v2–v4 bitstream; lab only
- MP5-H: base + CORR correction frames

## Malformed chunk behavior

| Case | Behavior |
|------|----------|
| Truncated file / chunk past EOF | Parse error — file rejected |
| Required chunk CRC fail | Parse error |
| Optional chunk CRC fail | Warning + chunk skipped |
| Invalid JSON in optional chunk | Decode fails; chunk ignored for UI; export validation may warn |
| STEM without STDA | Stem validation errors on `rich` profile |
| Oversize payload | Security error at parser limits |

## Old files

- MP5-L v2 files: playable via legacy WASM decode; inspect warns “not v3”.
- MP5-C v2/v3 bitstreams: playable where WASM supports; not for distribution.
- Files with only unknown optionals: **playable** if HEAD+AUDI valid.

## Lab / experimental labeling

Tools (`pnpm inspect:mp5`, player Format panel) must label:

- MP5-C as **lab / may hiss**
- MP5-H without CORR as **warning**
- `.mp5p` album packages as **experimental manifest**
- Moonshot / registry-only chunks as **not implemented**

## Validation profiles

| Profile | Meaning |
|---------|---------|
| **basic** | Parses; HEAD + AUDI present |
| **playable** | basic + supported codec path |
| **rich** | playable + optional feature payloads validate (stems, lyrics, etc.) |
| **strict** | rich + FING/HASH present and consistent (when checker runs) |
| **package** | `.mp5p` manifest schema valid (+ sidecars if `--dir` provided) |

CLI: `pnpm validate:mp5 <file> [--profile playable]` · `pnpm validate:mp5p <manifest.mp5p> [--dir <folder>]`

**Never** imply legal authenticity or rights verification in validation output.

## Alpha vs Beta

### May still change before Beta

- Chunk registry entries (new optional chunks with decoders)
- Validation profile rules (stricter rich/strict)
- Album package (`.mp5p`) sidecar resolution UX
- Stem normalization thresholds (documented, not format-breaking)

### Should not break between v0.9 and Beta

- Existing `.mp5` with HEAD+AUDI+MP5-L v3
- Unknown optional chunk forward compatibility
- STEM/STDA layout v1
- VISU, SECT, HOOK, HILT, LYRC, FING, HASH for files that already validate at `rich`
- `.mp5p` manifest format `mp5-album-manifest-v1`

## Tooling

| Command | Purpose |
|---------|---------|
| `pnpm inspect:mp5 <file>` | Human-readable compatibility report |
| `pnpm validate:mp5 <file>` | Exit code validation by profile |
| `pnpm validate:mp5p <file.mp5p>` | Album manifest validation |
| `pnpm fixtures:validate` | Golden demo fixture gate |
| `pnpm compatibility:check` | Synthetic WAV/MP5 vitest suite |

See [`MP5_CHUNK_REGISTRY.md`](MP5_CHUNK_REGISTRY.md) and [`MP5_FEATURE_MATRIX.md`](MP5_FEATURE_MATRIX.md).
