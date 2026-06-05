# MP5 Alpha — Hosted Demo Validation

This document records **HTTPS hosted demo** validation for MP5 Alpha. Use it after [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md) build steps.

**Codec policy (unchanged):** MP5-L v3 default/recommended · MP5-C lab-only · MP5-H hybrid/large/not default.

---

## Recommended platform

| Platform | Status | Notes |
|----------|--------|--------|
| **Vercel** | **Recommended** | Project name **`mp5-audio`** → https://mp5-audio.vercel.app — see [`MP5_VERCEL_SETUP.md`](MP5_VERCEL_SETUP.md) |
| **Netlify** | Supported | `netlify.toml` — same build command pattern |
| **Any static host** | Supported | Upload `apps/web/dist` over HTTPS |

**Environment variables:** none required for the Alpha web demo. No private paths, API keys, or local `C:\Users\...` references in shipped bundles.

### Vercel URLs (do not confuse)

| URL | Role |
|-----|------|
| **https://mp5-audio.vercel.app** | **Canonical** public demo (after `mp5-audio` project deploy) |
| https://mp5-alpha-demo.vercel.app | **Invalid** — broken/blank; do not share |
| https://dist-livid-two-82.vercel.app | **Temporary** — prebuilt validation only |

---

## Vercel deployment checklist

Full steps: [`MP5_VERCEL_SETUP.md`](MP5_VERCEL_SETUP.md)

- [ ] GitHub repo **`mp5-audio`**
- [ ] Vercel project **`mp5-audio`** (not `mp5-alpha-demo` or `dist`)
- [ ] `pnpm alpha:check` / `pnpm deploy:check` / `pnpm vercel:check` pass locally
- [ ] Root directory = repo root; output **`apps/web/dist`**
- [ ] Build: `node scripts/vercel-build.mjs` (from `vercel.json`)
- [ ] Production URL: **https://mp5-audio.vercel.app**
- [ ] `MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify`
- [ ] `MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted`

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

## Hosted validation (May 2026)

| Field | Value |
|-------|--------|
| **Canonical URL** | **https://mp5-audio.vercel.app** |
| **Release** | **v0.15.6-alpha** — embedded album hotfix + hosted demo lock |
| **Vercel project** | `mp5-audio` (Git: `cjocollin/MP5-audio`) |
| **Git build** | `node scripts/vercel-build.mjs` → **Pass** |
| **HTTP smoke** | **Pass** — `pnpm hosted:verify` (May 2026, v0.15.6-alpha deploy) |
| **Browser e2e** | **Pass** — 3/3 hosted tests (`app-version` includes **v0.15.6-alpha**) |
| **Manual** | HADES `.mp5p` embedded album QA accepted locally (not deployed) |

**Retired URLs (do not share):**

- https://mp5-alpha-demo.vercel.app — broken/blank
- https://dist-livid-two-82.vercel.app — temporary prebuilt validation only

```bash
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted
```

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
| Version label | `data-testid="app-version"` | `MP5 Alpha · v0.10.2-alpha` |

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

### Option A — Git-connected `mp5-audio` (recommended)

See [`MP5_VERCEL_SETUP.md`](MP5_VERCEL_SETUP.md).

1. Push to GitHub repo **`mp5-audio`**.
2. Vercel → New project → **`mp5-audio`** → import repo.
3. Confirm `vercel.json` settings (root, `node scripts/vercel-build.mjs`, `apps/web/dist`).
4. Deploy → **https://mp5-audio.vercel.app**

### Option B — Prebuilt dist (emergency / validation only)

```bash
pnpm build && pnpm deploy:check
npx vercel deploy apps/web/dist --yes
```

Produces a **temporary** URL (e.g. `dist-*.vercel.app`) — not the canonical demo.

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
