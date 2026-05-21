# MP5 credits, rights, and release identifiers

Optional metadata for creators, labels, podcasters, and music libraries. **Informational only** — MP5 does not enforce licenses, DRM, or legal claims.

## Design principles

- All chunks are **optional**. Players must work without them.
- Rights metadata is **not verified** and **not enforced** in playback.
- No DRM, blockchain, payment rails, or licensing automation in this MVP.
- Third-party players may **ignore** CRDT, LICN, and IDEN entirely.

## Chunks

| FourCC | Purpose |
|--------|---------|
| **CRDT** | Detailed credits (artists, producers, engineers, label, performers, notes) |
| **LICN** | Rights / license hints (copyright, license type/URL, usage flags as informational tri-state) |
| **IDEN** | Release identifiers (ISRC, UPC/EAN, catalog, URLs, dates) |

JSON payloads use the same 64 KiB cap and sanitization as other optional chunks (`sanitizeMetadata`, `sanitizeHttpUrl` for URLs).

### CRDT (credits)

Supports multiple names per role where appropriate:

- `primaryArtist`, `featuredArtists`, `producer`, `songwriter`, `composer`, `lyricist`
- `mixingEngineer`, `masteringEngineer`, `recordingEngineer`
- `label`, `publisher`, `copyrightHolder`
- `performers[]` — `{ name, instrument? }`
- `instruments[]` — string list
- `additionalCredits[]` — `{ role, names[] }`
- `notes` — freeform text

### LICN (rights / license)

- `copyrightNotice`, `licenseType`, `licenseUrl` (http/https only)
- `usageNotes`
- `remixAllowed`, `commercialUseAllowed`, `attributionRequired` — `true` | `false` | `"unknown"`
- `informationalOnly` — default disclaimer string on encode

Players should display calmly, e.g. *“Rights metadata is informational only and may not be verified.”*

### IDEN (identifiers)

Separate chunk (not folded into META) for clarity:

- `isrc` (12 alphanumeric, hyphens stripped on normalize)
- `upc`, `ean` (8–14 digits)
- `catalogNumber`, `releaseId`, `distributor`
- `artistUrl`, `albumUrl`, `sourceUrl` (http/https)
- `releaseDate`, `originalReleaseDate`

## Album packages (`.mp5p`)

Manifest may include optional album-level:

- `credits` — freeform string (legacy/simple)
- `crdt`, `licn`, `iden` — same schemas as track chunks

Track-level `.mp5` credits remain independent per file.

## Converter & player

- **Converter** — collapsed sections: Credits, Rights & license, Release identifiers (default closed).
- **Player** — Metadata details panel shows each block when present; missing chunks do not affect playback.

## Safety

- Text length limits per field; control characters stripped
- No HTML/script in strings; suspicious role names dropped
- Malformed JSON decodes to `null` (optional chunk skipped)
- Unknown JSON fields are dropped on normalize (not preserved in MVP)

## See also

- [MP5_METADATA_SPEC.md](./MP5_METADATA_SPEC.md)
- [MP5_ALBUM_PACKAGE.md](./MP5_ALBUM_PACKAGE.md)
