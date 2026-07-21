# MP5 Public Beta Hosted Demo Validation

**Version:** MP5 Audio v0.28.0-beta (Public Beta)  
**Canonical URL:** https://mp5-audio.vercel.app  
**Last updated:** 2026-06-16

Use this document for production hosted-demo validation after local gates pass.

## Platform

| Platform | Status | Notes |
|----------|--------|-------|
| Vercel | Recommended | Project `mp5-audio`, production URL https://mp5-audio.vercel.app |
| Netlify | Supported static host | Uses `netlify.toml`, publishes `apps/web/dist` |
| Any HTTPS static host | Supported | Upload `apps/web/dist`; service worker and WASM mime types must work |

The web demo does not require environment variables. No private paths, API keys, or local `C:\Users\...` references should appear in shipped bundles.

## Copyrighted Audio Policy

| Location | Included in deploy? |
|----------|---------------------|
| `test-fixtures/*.mp5` | Synthetic tones/demos only; copied when build tooling includes fixtures |
| `test-fixtures/*.mp5p` | Synthetic package fixtures only |
| `benchmarks/real-music/` | Local dev/bench only; not deployed |
| Private `.flac`, `.wav`, `.mp3`, `.m4a` | Must not be committed or deployed |

Audit with `pnpm audit:deploy`.

## Pre-Deploy Gates

```bash
pnpm lint
pnpm test
pnpm test:compat
CI=1 pnpm test:e2e
pnpm playback:check
CI=1 pnpm beta:check
CI=1 pnpm beta:check
pnpm build
pnpm deploy:check
```

Package validation:

```bash
pnpm fixtures:embedded-album
node scripts/validate-embedded-album-package.mjs
pnpm inspect:mp5 test-fixtures/demo_embedded_album_package.mp5p
pnpm validate:mp5p test-fixtures/demo_embedded_album_package.mp5p --profile package
pnpm validate:mp5p test-fixtures/demo_album_package.mp5p --dir test-fixtures --profile package
```

Do not use or commit copyrighted/private local audio for release gates.

## Production Deploy

```bash
npx vercel deploy --prod --yes
```

After deployment:

```bash
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted
```

## Hosted Validation Matrix

| Check | Method | Expected |
|-------|--------|----------|
| App shell | GET `/` | 200 and MP5 Audio app shell |
| Version badge | `data-testid="app-version"` | `MP5 Public Beta - v0.28.0-beta` |
| PWA manifest | GET `/manifest.webmanifest` | `name: MP5 Player` |
| Service worker | GET `/sw.js` | 200 and precache data |
| MP5 codec WASM | GET built WASM asset | 200 |
| FFmpeg WASM | GET FFmpeg core asset | 200 |
| MP5-L demo | Hosted e2e | Loads, plays, seek duration > 0 |
| Karaoke demo | Hosted e2e | Lyrics panel and karaoke toggle work |
| Embedded album demo | Hosted e2e | Album view loads, queue/player controls visible |
| Converter | Hosted e2e | Converter panel opens |
| Batch | Hosted e2e | Batch panel and album builder open |
| Mobile viewport | Hosted e2e 375x812 | No horizontal overflow; controls tappable |
| VISU containment | Hosted e2e/local e2e | Visual theme stays inside player area |
| Public claims | Docs/tests | Honest experimental wording preserved |

## v0.28.0-beta Hosted Record

| Field | Value |
|-------|-------|
| Production URL | Pending deployment |
| Deployment URL | Pending deployment |
| Deploy ID | Pending deployment |
| Badge | `MP5 Public Beta - v0.28.0-beta` |
| `hosted:verify` | Pending |
| `test:e2e:hosted` | Pending |
| Private/copyrighted audio | Not used for release gates |

## Hosted demo limitations

1. Large first load due to WASM and FFmpeg assets.
2. Browser memory/storage can limit large packages or stem-heavy tracks.
3. PWA install requires HTTPS.
4. Demo fixtures are synthetic; users load their own files locally.
5. This is not a production music service and does not claim to beat MP3/AAC/Opus/FLAC.

## Related Docs

- [Deployment guide](MP5_DEPLOYMENT_GUIDE.md)
- [Vercel setup](MP5_VERCEL_SETUP.md)
- [Beta readiness](MP5_BETA_READINESS.md)
- [Developer quickstart](MP5_DEVELOPER_QUICKSTART.md)
