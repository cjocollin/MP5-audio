# MP5 Alpha — Hosted Demo Validation

This document records **HTTPS hosted demo** validation for MP5 Alpha. Use it after [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md) build steps.

**Codec policy (unchanged):** MP5-L v3 default/recommended · MP5-C lab-only · MP5-H hybrid/large/not default.

---

## Recommended platform

| Platform | Status | Notes |
|----------|--------|--------|
| **Vercel** | **Recommended** | `vercel.json` at repo root; static `apps/web/dist` or `node scripts/vercel-build.mjs` on CI |
| **Netlify** | Supported | `netlify.toml` — same build command pattern |
| **Any static host** | Supported | Upload `apps/web/dist` over HTTPS |

**Environment variables:** none required for the Alpha web demo. No private paths, API keys, or local `C:\Users\...` references in shipped bundles.

---

## Vercel deployment checklist

- [ ] `pnpm alpha:check` passes locally
- [ ] `pnpm audit:deploy` passes (no copyrighted source audio; dist safe)
- [ ] `pnpm build` and `pnpm deploy:check` pass
- [ ] Repo linked in Vercel **or** deploy prebuilt: `npx vercel deploy apps/web/dist --yes`
- [ ] Build command (Git deploy): `node scripts/vercel-build.mjs` (installs wasm-pack on Linux if WASM pkg absent)
- [ ] Output directory: `apps/web/dist`
- [ ] Node 20+
- [ ] Confirm deployment URL uses **HTTPS**
- [ ] Run hosted smoke: `MP5_HOSTED_URL=https://… node scripts/verify-hosted-demo.mjs`
- [ ] Run browser checks: `MP5_HOSTED_URL=https://… pnpm test:e2e:hosted`
- [ ] Manual: Converter → export WAV → **Open in Player** → Format panel **MP5-L v3**

## Netlify deployment checklist

- [ ] Same local gates as above
- [ ] Build: `node scripts/vercel-build.mjs` (or prebuild locally and publish `apps/web/dist`)
- [ ] Publish directory: `apps/web/dist`
- [ ] `netlify.toml` headers for `*.wasm` → `application/wasm`
- [ ] HTTPS enabled (Netlify default)
- [ ] Same hosted smoke + browser steps as Vercel

---

## Copyrighted audio policy

| Location | Included in deploy? |
|----------|---------------------|
| `test-fixtures/*.mp5` | **Synthetic tones only** — optional copy into `dist/fixtures/` at build |
| `benchmarks/real-music/` | **Local dev/bench only** — `.gitignore` / not in `dist/` |
| `.flac`, `.wav`, `.mp3`, `.m4a` in repo | **Must not be committed** (gitignored) |

Audit: `pnpm audit:deploy`

---

## Validated hosted deployment (May 2026)

| Field | Value |
|-------|--------|
| **Platform** | Vercel (static deploy of `apps/web/dist`) |
| **Production URL** | https://dist-livid-two-82.vercel.app |
| **HTTP smoke** | **Pass** — shell, manifest, SW, WASM, FFmpeg, demo fixture, main bundle |
| **Browser e2e** | **Pass** (3/3) — tagline, MP5-L demo play, Converter tab |
| **Manual (recommended)** | WAV export → **Open in Player** → Format **MP5-L v3** on hosted URL |

> **Note:** Git-connected deploy to project `mp5-alpha-demo` requires `wasm-pack` on the builder (`scripts/vercel-build.mjs`). Prebuilt deploy of local `dist/` avoids Rust on CI.

---

## Hosted validation matrix

| Check | Method | Expected |
|-------|--------|----------|
| App shell | GET `/` | 200, MP5 Player heading |
| PWA manifest | GET `/manifest.webmanifest` | `name: MP5 Player` |
| Service worker | GET `/sw.js` | 200, precache lists WASM |
| MP5 codec WASM | GET `/assets/*mp5_codec*.wasm` | 200 |
| FFmpeg WASM | GET `/assets/*ffmpeg-core*.wasm` | 200 |
| Demo fixture | GET `/fixtures/demo_mp5l_v3_tone.mp5` | 200 if bundled at build |
| MP5-L demo plays | Browser — **Load MP5-L demo & play** | Seek max > 0 |
| Format panel | Browser | Shows MP5-L v3 |
| Converter loads | Browser — Converter tab | Panel visible |
| Export MP5-L | Browser — drop WAV, export | Download / summary |
| Open in Player | Browser — after export | Track in queue |
| Version label | `data-testid="app-version"` | `MP5 Alpha · v0.1.0` |

Automated HTTP: `MP5_HOSTED_URL=… node scripts/verify-hosted-demo.mjs`  
Automated browser: `MP5_HOSTED_URL=… pnpm test:e2e:hosted`

---

## Hosted demo limitations

1. **Large first load** — ~30+ MB service worker precache (FFmpeg WASM). First visit may take tens of seconds.
2. **FFmpeg / WASM cold start** — first convert or non-WAV decode loads ~31 MB FFmpeg WASM in-tab.
3. **Browser memory** — long files or many queue items can stress mobile browsers.
4. **PWA install** — requires **HTTPS** (hosted URL OK; plain HTTP hosts will not install).
5. **Google Fonts** — first paint needs network to `fonts.googleapis.com`.
6. **No server-side encoding** — all convert/decode in-browser; no background jobs.
7. **Demo fixture optional** — if missing from build, demo button shows a calm message; drop your own `.mp5`.
8. **Not a production music service** — experimental Alpha; MP5 does not claim to beat MP3/AAC/Opus/FLAC.

---

## Exact deploy steps (this environment)

### Option A — Prebuilt dist (fastest; used for validation URL)

```bash
pnpm wasm:build
pnpm fixtures:generate
pnpm build
pnpm deploy:check
npx vercel deploy apps/web/dist --yes
```

Copy the **Production** / **Aliased** HTTPS URL from CLI output.

### Option B — Git-connected Vercel (reproducible CI)

1. Push repo to GitHub/GitLab.
2. Import project in Vercel; root directory = repo root.
3. Use `vercel.json` (`buildCommand`: `node scripts/vercel-build.mjs`, `outputDirectory`: `apps/web/dist`).
4. Deploy; open production URL.

### Option C — Netlify

```bash
pnpm build
npx netlify deploy --prod --dir=apps/web/dist
```

---

## Commands (local gate before/after deploy)

```bash
pnpm alpha:check
pnpm build
pnpm deploy:check
pnpm audit:deploy
MP5_HOSTED_URL=https://your-url.vercel.app node scripts/verify-hosted-demo.mjs
MP5_HOSTED_URL=https://your-url.vercel.app pnpm test:e2e:hosted
```

---

## Related docs

- [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md)
- [`MP5_INSTALL_GUIDE.md`](MP5_INSTALL_GUIDE.md)
- [`MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md)
