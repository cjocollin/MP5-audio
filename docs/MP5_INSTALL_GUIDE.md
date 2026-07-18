# MP5 Install And Share Guide

**Version:** MP5 Audio v0.26.0-beta  
**Status:** Public Beta

MP5 is a browser-based experimental audio app. The recommended way to share it is the hosted HTTPS demo:

https://mp5-audio.vercel.app

## Platform capability table

| Option | Status | Notes |
|--------|--------|-------|
| Web / PWA | Recommended | Hosted Vercel app plus browser install from HTTPS when available |
| Local dev server | Contributor workflow | `pnpm demo` / `pnpm dev` |
| Static hosting | Supported | Build output in `apps/web/dist` |

## Local Setup

```bash
pnpm install
pnpm wasm:build
pnpm demo
```

Then open http://localhost:5173.

For the full developer setup, see [MP5_DEVELOPER_QUICKSTART.md](MP5_DEVELOPER_QUICKSTART.md).

## Sharing Rules

- Share the canonical hosted demo URL: https://mp5-audio.vercel.app.
- Use synthetic fixtures for public demos.
- Do not commit, upload, or deploy copyrighted/private local audio.
- Keep public copy honest: Public Beta, experimental, MP5-L v3 recommended, no beat-codec/DRM/legal-proof claims.
- MP5 does not claim to beat MP3, AAC, Opus, or FLAC.

## Offline behavior (honest)

The PWA can cache the app shell and previously loaded assets, but MP5 is not a guaranteed offline DAW. First load, non-WAV conversion, and codec paths may need large WASM/FFmpeg assets.

## Verification Before Sharing

```bash
pnpm lint
pnpm test
pnpm test:compat
CI=1 pnpm test:e2e
pnpm playback:check
CI=1 pnpm beta:check
pnpm build
pnpm deploy:check
```

Hosted checks:

```bash
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted
```
