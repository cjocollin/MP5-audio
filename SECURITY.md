# Security Policy

MP5 Audio parses binary container files, decompresses audio payloads, and runs Rust/WASM codec code in the browser. Treat untrusted `.mp5` / `.mp5p` files with caution — the project is **alpha / experimental** and not hardened for hostile input in production environments.

## Supported versions

Security fixes are considered only for the **current development line on `main`** (alpha releases, e.g. `v0.x.x-alpha`). Older tags and forks are unsupported unless explicitly noted in a release.

| Version | Supported |
|---------|-----------|
| Latest alpha on `main` | Yes |
| Older alpha tags | Best effort only |
| Pre-release experiments / forks | No |

## Reporting a vulnerability

**Please do not report security vulnerabilities in public GitHub issues, discussions, or pull requests.**

### Preferred: GitHub Private Security Advisories

Use GitHub's private reporting flow for this repository:

**https://github.com/cjocollin/MP5-audio/security/advisories/new**

This keeps details confidential until a fix is ready.

### Alternative contact (maintainer)

If private advisories are unavailable, contact the repository owner through GitHub (profile message) and ask for a private security channel.  
<!-- Maintainer: optionally add a dedicated security email below and enable GitHub security contact settings. -->
<!-- Security email (optional): security@example.com -->

We aim to acknowledge reports within **7 days** and provide a status update within **30 days**, though alpha maintenance bandwidth may vary.

## What counts as a security issue

Please report issues where **malicious or malformed MP5 input** could cause harm beyond normal alpha bugs:

| Category | Examples |
|----------|----------|
| **Crashes** | Parser or codec panic/abort from a crafted `.mp5` / `.mp5p` file |
| **Hangs** | Infinite loop or unbounded wait during parse, decompress, or decode |
| **Memory exhaustion** | Excessive allocation, decompression bombs, or unbounded buffer growth |
| **Unsafe file handling** | Path traversal, unexpected filesystem access, or unsafe temp file use (CLI/tools) |
| **WASM boundary issues** | Memory corruption, OOB access, or sandbox escape via WASM bindings |
| **Corrupted chunk parsing** | Mis-handled lengths/offsets leading to read past buffer or use-after-free class bugs |
| **CRC / validation bypasses** | Integrity checks silently skipped when they should fail closed |
| **Denial of service** | CPU spikes that lock the browser tab or CLI on small malicious inputs |

Include a **minimal reproducer** (redacted/synthetic file if possible), environment (OS, browser, Node/Rust versions), and observed vs expected behavior.

## What not to report as security

These belong in normal [bug reports](https://github.com/cjocollin/MP5-audio/issues) or docs — not private security advisories:

- **Normal audio quality bugs** (clipping, level mismatch, seek inaccuracy)
- **Known MP5-C hiss / artifact limitations** on music material
- **Expected alpha instability** (UI glitches, slow decode on large files, missing features)
- **Feature requests** or codec tuning without exploit impact
- **Social engineering** or issues outside this codebase (hosting provider, third-party CDN, user OS)

## Responsible disclosure

1. Report privately via [GitHub Security Advisories](https://github.com/cjocollin/MP5-audio/security/advisories/new).
2. Allow reasonable time to investigate and patch before public disclosure.
3. Do not exploit issues against third parties.
4. We will credit reporters in release notes when desired and when a fix ships (unless you prefer anonymity).

## User guidance

Until MP5 reaches broader maturity:

- **Do not open untrusted MP5 files** in production or high-value environments.
- Prefer **synthetic fixtures** from this repo for automated testing.
- Run the web demo and converter in a **normal browser profile**, not with elevated privileges.
- Keep **Node/Rust/toolchain** updated when running CLI validation locally.

For general limitations and known codec issues, see [`docs/MP5_KNOWN_ISSUES.md`](docs/MP5_KNOWN_ISSUES.md).
