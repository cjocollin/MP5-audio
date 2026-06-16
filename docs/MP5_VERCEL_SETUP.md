# MP5 Vercel Project Setup

**Version:** MP5 Audio v0.20.0-beta  
**Project:** `mp5-audio`  
**Production URL:** https://mp5-audio.vercel.app

Use this checklist for the canonical Public Beta Vercel project.

## Recommended Settings

| Setting | Value |
|---------|-------|
| Project name | `mp5-audio` |
| GitHub repository | `cjocollin/MP5-audio` |
| Root directory | repo root (`.`) |
| Framework preset | Other / static |
| Build command | `node scripts/vercel-build.mjs` |
| Output directory | `apps/web/dist` |
| Install command | `pnpm install` |
| Node.js version | 20.x or newer supported by Vercel |
| Environment variables | None required for the web demo |

`vercel.json` should be the source of truth for build/output/header settings.

## Local Checks Before Deploy

```bash
pnpm vercel:check
pnpm build
pnpm deploy:check
pnpm audit:deploy
```

Full release gates are listed in [MP5_BETA_READINESS.md](MP5_BETA_READINESS.md).

## Production Deploy

```bash
npx vercel deploy --prod --yes
```

After deployment:

```bash
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted
```

## Build Notes

`scripts/vercel-build.mjs` builds the container package, ensures WASM/demo fixtures/icons are available, and builds `@mp5/web` into `apps/web/dist`.

No private local paths, API keys, environment variables, or copyrighted/private audio should be required for the production build.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Build fails before web build | dependency/tooling install issue | inspect Vercel build logs; retry after local `pnpm build` passes |
| WASM 404 | wrong output directory or headers | keep root directory at repo root and output `apps/web/dist` |
| Demo fixture missing | fixtures were not generated/copied | run `pnpm build` and `pnpm deploy:check` locally |
| Stale badge after deploy | service worker cache | refresh hosted app and rerun hosted checks |

## Related Docs

- [Deployment guide](MP5_DEPLOYMENT_GUIDE.md)
- [Hosted demo validation](MP5_HOSTED_DEMO.md)
- [`vercel.json`](../vercel.json)
