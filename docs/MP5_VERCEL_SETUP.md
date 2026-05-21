# MP5 Alpha — Vercel project setup (`mp5-audio`)

Use this checklist to create the **canonical** public demo on Vercel. Do **not** treat temporary or misnamed projects as production.

| URL / project | Status |
|---------------|--------|
| **https://mp5-audio.vercel.app** | **Live** — Vercel project `mp5-audio` linked to GitHub `cjocollin/MP5-audio` |
| `https://mp5-alpha-demo.vercel.app` | **Do not use** — blank/broken Git build (wrong project); retire or delete in Vercel dashboard |
| `https://dist-livid-two-82.vercel.app` | **Temporary only** — prebuilt `dist/` upload for hosted validation; not the final public URL |

**Codec policy (unchanged):** MP5-L v3 default · MP5-C lab-only · MP5-H hybrid/not default.

---

## Recommended Vercel settings

| Setting | Value |
|---------|--------|
| **Project name** | `mp5-audio` |
| **GitHub repository** | `mp5-audio` (or your org/`mp5-audio`) |
| **Root directory** | `.` (repo root) |
| **Framework preset** | Other (no framework) |
| **Build command** | `node scripts/vercel-build.mjs` (from [`vercel.json`](../vercel.json)) |
| **Output directory** | `apps/web/dist` |
| **Install command** | `pnpm install` |
| **Node.js version** | 20.x |
| **Environment variables** | **None required** |

`vercel.json` at the repo root overrides dashboard defaults when present.

---

## Create the `mp5-audio` Vercel project (checklist)

1. **GitHub**
   - [ ] Create or rename repository to **`mp5-audio`**
   - [ ] Push this MP5 Alpha codebase to `main`
   - [ ] Confirm **no** `.flac` / `.mp3` / copyrighted audio is committed (only synthetic `test-fixtures/`)

2. **Retire old Vercel projects** (dashboard)
   - [ ] Do **not** link production traffic to `mp5-alpha-demo` or `dist`
   - [ ] Optional: delete or archive those projects after `mp5-audio` is live

3. **New Vercel project**
   - [ ] [vercel.com/new](https://vercel.com/new) → Import Git repository **`mp5-audio`**
   - [ ] Project name: **`mp5-audio`** (production alias → `mp5-audio.vercel.app`)
   - [ ] Root directory: **repository root** (not `apps/web`)
   - [ ] Confirm Build / Output match table above (read from `vercel.json`)
   - [ ] Deploy

4. **Post-deploy verification**
   - [ ] `MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm hosted:verify`
   - [ ] `MP5_HOSTED_URL=https://mp5-audio.vercel.app pnpm test:e2e:hosted`
   - [ ] Browser: **Load MP5-L demo & play** → Format panel shows **MP5-L v3**
   - [ ] Browser: Converter → export WAV → **Open in Player**
   - [ ] PWA install works (HTTPS)

5. **Document the live URL**
   - [ ] Update team/demo links to **`https://mp5-audio.vercel.app`** only

---

## Fresh Git clone build (`scripts/vercel-build.mjs`)

On Vercel Linux builders the script:

1. Uses committed **`apps/web/src/wasm/pkg/*`** when present (recommended — skips Rust on the builder).
2. Otherwise installs **Rust + wasm32 + wasm-pack** and runs **`pnpm wasm:build` in the same bash session** (cargo is not on PATH across separate shell steps).
3. Builds `@mp5/container`, generates demo fixture + icons if needed
4. Runs `pnpm --filter @mp5/web build` → **`apps/web/dist`**

No `C:\Users\...` paths. No local machine paths. No env vars.

**Required for reliable Vercel deploys:** commit `apps/web/src/wasm/pkg/*` (release wasm-pack output). Without it, the builder compiles Rust (~minutes) and may hit timeouts or `wasm-pack: command not found` if install steps run in separate shells.

---

## Pre-deploy local gate

```bash
pnpm alpha:check
pnpm build
pnpm deploy:check
pnpm audit:deploy
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Blank page at `mp5-alpha-demo.vercel.app` | Wrong project / failed build | Use **`mp5-audio`** project; check Vercel build logs |
| Build fails: `wasm-pack: command not found` | Old build command | Use `node scripts/vercel-build.mjs` from current `vercel.json` |
| Build fails: Rust errors | Transient builder | Re-deploy; check `scripts/vercel-build.mjs` logs |
| Demo button missing file | Fixture not generated | `vercel-build` runs `generate-demo-fixtures.mjs` when needed |
| 404 on WASM | Wrong output dir | Output must be **`apps/web/dist`**, root **repo root** |

---

## Related docs

- [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md)
- [`MP5_HOSTED_DEMO.md`](MP5_HOSTED_DEMO.md)
- [`vercel.json`](../vercel.json)
