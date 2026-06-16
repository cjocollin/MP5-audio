# MP5 Developer Quickstart

**Version:** MP5 Audio v0.20.0-beta

This guide is for developers, testers, and contributors who want to run MP5 locally, inspect files, validate packages, and reproduce the public beta gates.

## What MP5 is

MP5 is an experimental browser-based audio format, container, codec, converter, and player project.

- `.mp5` is the single-track container with `MP5A` magic.
- `.mp5p` is an experimental album package. It can be a JSON manifest with sidecar `.mp5` files, or one embedded binary package with `MP5P` magic.
- MP5-L v3 is the recommended/default lossless path.
- MP5-C is lab-only and may hiss.
- MP5-H is large/experimental and not default.
- Rights, fingerprint, and credit metadata are informational only. MP5 is not DRM and does not provide legal proof.

## Privacy and fixture rules

All app conversion, playback, diagnostics, and library storage are browser-local. The project does not add telemetry, upload user files, or add cloud sync.

Only synthetic/demo-safe fixtures belong in the repo. Do not commit copyrighted, private, downloaded, or personally identifying audio. Local files such as HADES or Pity Party packages are manual-only and must stay outside the repo.

## Install

```bash
pnpm install
```

On this Windows setup, use the local Node/pnpm installation if the shell cannot find `pnpm`:

```powershell
$nodeDir = "C:\Users\colli\AppData\Local\Programs\nodejs\node-v24.14.0-win-x64"
$env:Path = "$nodeDir;$env:Path"
& "$nodeDir\pnpm.cmd" install
```

## Run the web app

```bash
pnpm dev
```

The Vite app usually runs at `http://127.0.0.1:5173/` or `http://localhost:5173/`.

## Build

```bash
pnpm build
pnpm deploy:check
```

`deploy:check` validates the production `dist` output, PWA assets, demo fixture, MP5 WASM, and FFmpeg WASM.

## Tests

Fast checks:

```bash
pnpm lint
pnpm test
pnpm test:compat
```

Full local release gates:

```bash
CI=1 pnpm test:e2e
pnpm playback:check
CI=1 pnpm alpha:check
CI=1 pnpm beta:check
```

Playwright on this Windows setup may need the stable browser cache:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "C:\Users\colli\mp5-pw-browsers"
```

## Generate and validate demo fixtures

```bash
pnpm fixtures:generate
pnpm fixtures:embedded-album
pnpm fixtures:validate
node scripts/validate-embedded-album-package.mjs
```

The generated fixtures are synthetic tones and synthetic stem demos only.

## Inspect and validate files

Inspect a single `.mp5`:

```bash
pnpm inspect:mp5 test-fixtures/demo_mp5l_v3_tone.mp5
```

Inspect an embedded `.mp5p`:

```bash
pnpm inspect:mp5 test-fixtures/demo_embedded_album_package.mp5p
```

Validate an embedded package:

```bash
pnpm validate:mp5p test-fixtures/demo_embedded_album_package.mp5p --profile package
```

Validate a manifest package with sidecars:

```bash
pnpm validate:mp5p test-fixtures/demo_album_package.mp5p --dir test-fixtures --profile package
```

Profiles:

| Profile | Meaning |
|---------|---------|
| `basic` | Container parses and required structure is present. |
| `playable` | `HEAD` + `AUDI` are available for playback. |
| `rich` | Playable plus optional rich metadata/stems validate when present. |
| `strict` | Rich plus integrity metadata checks when available. |
| `package` | `.mp5p` manifest or embedded package structure validates. |

## Hosted verification

After production deployment:

```bash
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted
```

Hosted checks confirm the public shell, version badge, MP5-L demo, karaoke demo, embedded album demo, converter, batch mode, mobile usability, and honest public claims.

## Common failure checks

- `Invalid magic`: the file is not an MP5 container or embedded package.
- `Unsupported version`: the file uses a version this beta does not parse.
- `CRC mismatch`: required chunks fail closed; optional chunks may be skipped.
- `Manifest JSON too large`: `.mp5p` manifest exceeded the 8 MiB JSON cap.
- `Missing sidecar`: manifest `.mp5p` cannot find one or more referenced `.mp5` files.
- `Embedded fragment CRC mismatch`: embedded package track bytes are corrupt or incomplete.
- `Storage quota`: browser library storage is full or blocked by the profile.
- `WASM/FFmpeg loading`: refresh, retry, or use WAV/MP5-only flows when FFmpeg WASM fails.

## Bug reports

Use GitHub Issues or the hosted app Settings feedback links. Include diagnostics copied from Settings when possible. Diagnostics are manual/copyable and are designed to avoid local path leakage; do not attach private audio unless you intentionally want maintainers to inspect it.
