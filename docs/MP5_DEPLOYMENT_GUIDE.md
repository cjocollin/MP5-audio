# MP5 Alpha — Web Demo Deployment Guide

Deploy the **MP5 Alpha** web demo as a static site. The primary artifact is `apps/web/dist` after `pnpm build`.

**Codec policy (unchanged):** MP5-L v3 default/recommended · MP5-C lab-only (may hiss) · MP5-H hybrid/large/not default.

**Honest positioning:** MP5 is **experimental**. It **does not claim to beat MP3, AAC, Opus, or FLAC.**

---

## Pre-deploy checklist

Run in order before sharing a public URL:

- [ ] `pnpm alpha:check` — full Alpha gate (tests, fixtures, e2e)
- [ ] `pnpm wasm:build` — MP5-L/C/H codecs in browser bundle
- [ ] `pnpm fixtures:generate` — synthetic demo tone (no copyrighted audio)
- [ ] `pnpm icons:generate` — PWA icons (if missing)
- [ ] `pnpm build` — production bundle → `apps/web/dist`
- [ ] `pnpm deploy:check` — validates dist (WASM, FFmpeg, manifest, icons)
- [ ] `pnpm demo:prod` — local production preview at http://127.0.0.1:4173
- [ ] `node scripts/verify-prod-preview.mjs` — HTTP smoke (preview must be running)
- [ ] Browser: **Load MP5-L demo** plays synthetic tone
- [ ] Browser: drop a real **MP5-L** `.mp5` and play
- [ ] Browser: **Converter** tab loads; WAV convert works
- [ ] Read tagline / About — codec policy and “does not beat MP3…” visible
- [ ] Confirm **no copyrighted music** is committed (only `test-fixtures/` synthetic tones)

---

## Build commands

```bash
pnpm install
pnpm wasm:build
pnpm fixtures:generate
pnpm icons:generate
pnpm build
pnpm deploy:check
```

**Local production preview:**

```bash
pnpm demo:prod
# or: pnpm preview   (after build)
```

Preview URL: **http://127.0.0.1:4173**

---

## What gets deployed

| Path (in `dist/`) | Purpose |
|-------------------|---------|
| `index.html` + `assets/*` | React app, **MP5 codec WASM**, **FFmpeg WASM** (~32 MB) |
| `manifest.webmanifest` | PWA install metadata |
| `sw.js` | Service worker (app shell precache) |
| `icons/*` | PWA / favicon |
| `fixtures/demo_mp5l_v3_tone.mp5` | Optional demo button (copied at build if fixture exists) |

**Normal operation does not require** the demo fixture — users can drop their own `.mp5`. If the fixture is missing, the UI shows a calm message.

---

## Warnings (read before sharing)

### Large first load

- Production bundle includes **FFmpeg WASM** (~32 MB) and **MP5 codec WASM** (~90 KB).
- Service worker may precache **~30+ MB** on first install.
- First visit can take **tens of seconds** on slow networks.

### Browser memory

- Decoding long files is **CPU-bound** (WASM).
- Very large sources may hit mobile browser memory limits.

### HTTPS and PWA

- **PWA install** on public hosts requires **HTTPS**.
- `localhost` / `127.0.0.1` are fine for local install testing.

### Fonts

- `index.html` loads **DM Sans** from Google Fonts (network on first paint).

### No copyrighted music in repo

- Only **synthetic** demo tones in `test-fixtures/`.
- Tell viewers to convert **their own** FLAC/WAV for real listening tests.

---

## Vercel (`mp5-audio`)

**Canonical public demo:** Vercel project **`mp5-audio`** → **https://mp5-audio.vercel.app**

Do **not** use `mp5-alpha-demo.vercel.app` (broken) or `dist-livid-two-82.vercel.app` (temporary validation).

Step-by-step: [`MP5_VERCEL_SETUP.md`](MP5_VERCEL_SETUP.md)

Repo includes [`vercel.json`](../vercel.json):

| Setting | Value |
|---------|--------|
| **Install** | `pnpm install` |
| **Build** | `node scripts/vercel-build.mjs` (Rust + wasm-pack on fresh clone) |
| **Output** | `apps/web/dist` |
| **WASM headers** | `Content-Type: application/wasm` for `/assets/*.wasm` |

```bash
pnpm vercel:check    # validate vercel.json + vercel-build.mjs
```

**Monorepo note:** root directory = repo root (not `apps/web`). No env vars. No local `C:\Users\` paths.

---

## Netlify

Repo includes [`netlify.toml`](../netlify.toml):

- **Publish:** `apps/web/dist`
- **Build:** same as Vercel
- **Node:** 20

Connect the repo in Netlify UI or:

```bash
npx netlify deploy --prod --dir=apps/web/dist
```

(after local `pnpm build`).

---

## Generic static hosting

Upload **contents of** `apps/web/dist` to any static host (S3 + CloudFront, GitHub Pages, Cloudflare Pages, nginx, etc.).

Requirements:

1. Serve `index.html` for unknown paths if you add client-side routes later (current Alpha is single-page tabs only).
2. Set **`Content-Type: application/wasm`** for `*.wasm` files.
3. Enable **gzip/brotli** at the CDN edge.
4. Use **HTTPS** for PWA install.

**Cloudflare Pages example build:**

- Build command: `pnpm wasm:build && pnpm icons:generate && pnpm build`
- Output directory: `apps/web/dist`

---

## Local preview (no deploy)

| Command | Description |
|---------|-------------|
| `pnpm preview` | `vite preview` on port **4173** (requires prior `pnpm build`) |
| `pnpm demo:prod` | Setup + build if needed + preview |
| `node scripts/verify-prod-preview.mjs` | HTTP checks against preview |

**Dev vs production:**

| | `pnpm demo` (dev) | `pnpm demo:prod` (preview) |
|--|-------------------|----------------------------|
| Server | Vite dev :5173 | `dist/` :4173 |
| Use for | Development | Pre-deploy verification |

---

## Verify asset paths (production)

After `pnpm build`, confirm:

```bash
pnpm deploy:check
```

Expect:

- `dist/assets/*mp5_codec*.wasm` — MP5 codecs
- `dist/assets/*ffmpeg-core*.wasm` — FFmpeg decode
- `dist/assets/*ffmpeg-core*.js` — FFmpeg loader
- `dist/manifest.webmanifest` — PWA
- `dist/icons/mp5-192.png` — install icon

Vite bundles FFmpeg via `?url` imports in `ffmpegLoader.ts`; paths are hashed under `/assets/` and work in production.

---

## App version label

The UI shows **MP5 Alpha · v0.1.0** (from root `package.json`) in the header — helps confirm which build is deployed.

---

## Hosted demo validation (HTTPS)

After deploy, validate the public URL:

```bash
MP5_HOSTED_URL=https://your-app.vercel.app pnpm hosted:verify
MP5_HOSTED_URL=https://your-app.vercel.app pnpm test:e2e:hosted
pnpm audit:deploy
```

Full checklist, validated URL, and limitations: [`MP5_HOSTED_DEMO.md`](MP5_HOSTED_DEMO.md).

---

## Related docs

- [`MP5_VERCEL_SETUP.md`](MP5_VERCEL_SETUP.md) — create project **mp5-audio**
- [`MP5_HOSTED_DEMO.md`](MP5_HOSTED_DEMO.md) — hosted HTTPS validation record
- [`MP5_INSTALL_GUIDE.md`](MP5_INSTALL_GUIDE.md) — PWA install, platform table
- [`MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md) — demo walkthrough
- [`MP5_ALPHA_RELEASE_CHECKLIST.md`](MP5_ALPHA_RELEASE_CHECKLIST.md) — release gate
- [`WASM_SETUP.md`](WASM_SETUP.md) — codec build

---

## Deployment limitations (remaining)

1. **Not a CDN-optimized media product** — large WASM, no edge transcoding.
2. **Offline** — partial only; see install guide.
3. **No server-side convert** — all encoding in-browser.
4. **Demo fixture** — optional; must run `fixtures:generate` before build to bundle it.
5. **Desktop/mobile wrappers** — not part of this web deploy path.
