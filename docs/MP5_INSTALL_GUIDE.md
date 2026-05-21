# MP5 Install & Share Guide (Alpha)

**Version:** MP5 Audio v0.10.0-alpha

**Primary target:** installable **web app / PWA** in a modern browser.  
**Desktop / mobile:** packaging scaffolds only — not guaranteed production apps yet.

**Codec policy (unchanged):** MP5-L v3 default/recommended · MP5-C lab-only (may hiss) · MP5-H hybrid/large/not default · PCM reference/debug.

**MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

---

## Quick start (development)

```bash
pnpm install
pnpm wasm:build          # required for MP5-L / MP5-C / MP5-H in browser
pnpm demo                # checks + http://localhost:5173
```

Or:

```bash
pnpm dev                 # Vite dev server only
```

**Recommended demo path:** `pnpm demo` → welcome panel → **Load MP5-L demo** or Converter → export → **Open in Player**. See [`MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md).

---

## Production web build

```bash
pnpm wasm:build
pnpm icons:generate      # placeholder PWA icons (if missing)
pnpm build               # apps/web/dist
pnpm --filter @mp5/web preview   # optional local preview of dist
```

Serve `apps/web/dist` over **HTTPS** for PWA install prompts (localhost is also installable in Chrome/Edge).

---

## PWA install (recommended Alpha distribution)

### What is configured

| Item | Value |
|------|--------|
| **Name** | MP5 Player |
| **Short name** | MP5 |
| **Theme / background** | `#0a0a0f` |
| **Display** | `standalone` |
| **Icons** | `public/icons/mp5-192.png`, `mp5-512.png`, `mp5-icon.svg` |
| **Start URL** | `/` |

### How to install

1. Build or run the app over **HTTPS** (or `http://localhost:5173` for dev).
2. **Chrome / Edge (desktop):** address bar **Install** (⊕) or menu → *Install MP5*.
3. **Chrome (Android):** menu → *Install app* / *Add to Home screen*.
4. **Safari (iOS):** Share → *Add to Home Screen* (uses apple-touch-icon; limited PWA APIs).

### Offline behavior (honest)

| Works offline (after first successful load) | Not guaranteed offline |
|---------------------------------------------|-------------------------|
| App shell (cached by service worker) | **First visit** (needs network for initial assets) |
| MP5 **player** for cached `.mp5` in session | **Google Fonts** (loaded from CDN in `index.html`) |
| **WAV** convert path (Web Audio decode) | **FLAC/MP3/…** until FFmpeg WASM has loaded once |
| WASM codec if bundled and cached | Very large files on low-memory devices |

**Summary:** Treat the PWA as **offline-capable for the UI and previously loaded codecs**, not as a fully offline DAW. Full offline conversion of arbitrary formats is **not** a guaranteed Alpha feature.

### PWA verification

```bash
pnpm icons:generate
pnpm pwa:check
pnpm build && pnpm pwa:check    # also validates dist/manifest.webmanifest
```

---

## Desktop packaging (Tauri scaffold)

**Status: SCAFFOLD ONLY** — `src-tauri/tauri.conf.json` exists; **no** complete `src-tauri` Rust project or CI desktop build yet.

| Item | State |
|------|--------|
| Config | `src-tauri/tauri.conf.json` |
| **`.mp5` file association** | Declared in `bundle.fileAssociations` |
| Frontend output | `apps/web/dist` |
| Dev URL | `http://localhost:5173` |
| Native FFmpeg | **Not configured** — `decodeSourceToPcm` throws in Tauri |
| Build command | **Not wired** in root `package.json` |

**When wired (future):**

```bash
pnpm wasm:build && pnpm build
# Requires: Rust, Tauri CLI, completed src-tauri project
tauri build
```

```bash
pnpm desktop:check    # reviews scaffold only
```

---

## Mobile packaging (Capacitor config)

**Status: CONFIG ONLY** — `capacitor.config.ts` points at `apps/web/dist`; **no** `ios/` or `android/` platform folders in repo.

| Item | State |
|------|--------|
| App ID | `com.mp5.player` |
| Web dir | `apps/web/dist` |
| Production-ready | **No** — not validated on devices |

**Known mobile limitations**

- **WASM + FFmpeg** — large downloads, memory pressure, slow cold start.
- **File import** — OS file picker behavior differs; no desktop-style drag-drop folder UX.
- **Downloads / export** — save-to-files flows vary; may need share sheet.
- **Large audio** — long encodes may be killed in background on iOS.
- **MP5-C hiss / MP5-H size** — same codec policy as web; not mobile-specific fixes.

**When wired (future):**

```bash
pnpm wasm:build && pnpm build
npx cap add ios      # or android — once
npx cap sync
```

```bash
pnpm mobile:check
```

---

## Platform capability table

| Capability | Web / PWA | Desktop (Tauri scaffold) | iOS (Capacitor scaffold) | Android (Capacitor scaffold) |
|------------|-----------|--------------------------|--------------------------|------------------------------|
| **Converter** | Yes (browser WASM + FFmpeg.wasm) | Same web UI if embedded; native FFmpeg **not** wired | Same web UI if embedded; **not** validated | Same web UI if embedded; **not** validated |
| **Player** | Yes | Yes (embedded web) | Expected web UI; **not** validated | Expected web UI; **not** validated |
| **File import** | Drag-drop, file picker | `.mp5` association planned; picker via webview | OS picker; limited vs desktop | OS picker; limited vs desktop |
| **Export / download** | Browser download | Save dialog TBD | Share/save TBD | Download TBD |
| **MP5-L v3** | **Default / recommended** | Same | Same (if app runs) | Same (if app runs) |
| **MP5-C / MP5-H** | Lab / experimental | Same policy | Same policy | Same policy |
| **PCM reference** | Yes (debug) | Yes | Yes | Yes |
| **Known limitations** | CPU WASM; fonts CDN; session playlist not persisted across reload | Scaffold only; no native decode path | Not production-ready; memory/background limits | Not production-ready; device variance |

---

## Build & check commands

| Command | Purpose |
|---------|---------|
| `pnpm build` | Production web build (`apps/web/dist`) |
| `pnpm icons:generate` | Placeholder PNG/SVG icons |
| `pnpm pwa:check` | Manifest + icon source checks (+ dist if built) |
| `pnpm desktop:check` | Tauri scaffold + `.mp5` association review |
| `pnpm mobile:check` | Capacitor config review |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | Playwright smoke tests |
| `pnpm alpha:check` | Full Alpha demo gate |

---

## Sharing the Alpha with others

1. **Easiest:** deploy `apps/web/dist` to any static host with **HTTPS**; share URL; users can **Install** as PWA.
2. **Local demo:** `pnpm demo` on your machine; share screen or tunnel (ngrok, etc.) — not ideal for end users.
3. **Do not claim** desktop/mobile store builds until `tauri build` / Capacitor platforms are completed and tested.

---

## Related docs

- [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md) — Vercel, Netlify, static hosting, pre-deploy checklist
- [`MP5_DEMO_GUIDE.md`](MP5_DEMO_GUIDE.md) — walkthrough
- [`WASM_SETUP.md`](WASM_SETUP.md) — codec build
- [`CURRENT_MP5_STATUS.md`](CURRENT_MP5_STATUS.md) — feature status
- [`MP5_ALPHA_RELEASE_CHECKLIST.md`](MP5_ALPHA_RELEASE_CHECKLIST.md) — release gate
