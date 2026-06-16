# MP5 Moonshot Features

**Version:** MP5 Audio v0.20.0-beta  
**Status:** Spec-only reservations

Moonshot chunks are reserved names only. They are not implemented product features and must never be required for playback.

Reserved FourCCs:

`ADPT`, `BRCH`, `RESP`, `EXPR`, `COMM`, `RULS`, `HEAL`, `TIME`, `CLEAN`, `LIVE`, `LANG`, `MAST`, `DNA_`, `SAMP`, `AIRG`

Rules:

- Core playback remains `HEAD` + `AUDI`.
- Unknown/reserved optional chunks are skipped safely.
- Rights-like metadata (`RULS`, `SIGN`, `LICN`) is informational only and not legal enforcement.
- Private/listening-context metadata (`TIME`, `NOTE`, `MEMR`) must be treated as local/private by default.
