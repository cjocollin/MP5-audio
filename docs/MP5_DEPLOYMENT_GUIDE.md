# MP5 Web Demo Deployment Guide

**Version:** MP5 Audio v0.20.0-beta  
**Canonical production URL:** https://mp5-audio.vercel.app

Deploy the Public Beta web demo as a static site. The production artifact is `apps/web/dist` after `pnpm build` or `node scripts/vercel-build.mjs`.

## Positioning

MP5 is experimental Public Beta. MP5-L v3 is recommended; MP5-C is lab-only; MP5-H is large/experimental. MP5 does not claim to beat MP3, AAC, Opus, or FLAC. It does not add telemetry, upload, cloud sync, DRM, or rights/legal verification.

## Pre-deploy checklist

```bash
pnpm lint
pnpm test
pnpm test:compat
CI=1 pnpm test:e2e
pnpm playback:check
CI=1 pnpm alpha:check
CI=1 pnpm beta:check
pnpm build
pnpm deploy:check
pnpm audit:deploy
```

Confirm only synthetic fixtures are present in deploy output.

## What Gets Deployed

| Path | Purpose |
|------|---------|
| `apps/web/dist/index.html` | React app shell |
| `apps/web/dist/assets/*` | JS/CSS, MP5 codec WASM, FFmpeg WASM |
| `apps/web/dist/manifest.webmanifest` | PWA metadata |
| `apps/web/dist/sw.js` | Service worker |
| `apps/web/dist/icons/*` | Icons |
| `apps/web/dist/fixtures/*` | Synthetic demo fixtures when generated |

## Vercel

Project: `mp5-audio`  
Production URL: https://mp5-audio.vercel.app

`vercel.json` uses:

| Setting | Value |
|---------|-------|
| Install | `pnpm install` |
| Build | `node scripts/vercel-build.mjs` |
| Output | `apps/web/dist` |
| WASM headers | `application/wasm` for `/assets/*.wasm` |

Production deploy:

```bash
npx vercel deploy --prod --yes
```

Hosted verification:

```bash
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted
```

## Netlify

`netlify.toml` publishes `apps/web/dist`.

```bash
pnpm build
npx netlify deploy --prod --dir=apps/web/dist
```

## Generic HTTPS Static Host

Upload the contents of `apps/web/dist`.

Requirements:

1. Serve `*.wasm` as `application/wasm`.
2. Use HTTPS for PWA install.
3. Enable gzip or brotli where possible.
4. Serve the app shell for unknown app routes if routes are added later.

## Limitations

- Large first load because WASM/FFmpeg assets are sizable.
- No server-side encoding or background jobs.
- No CDN-optimized media streaming.
- Demo fixtures are synthetic; users load their own files locally.

## Related Docs

- [Vercel setup](MP5_VERCEL_SETUP.md)
- [Hosted demo validation](MP5_HOSTED_DEMO.md)
- [Install guide](MP5_INSTALL_GUIDE.md)
- [Demo guide](MP5_DEMO_GUIDE.md)
