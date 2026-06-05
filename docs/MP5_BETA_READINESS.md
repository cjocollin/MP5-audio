# MP5 Beta readiness checklist

**Current version:** MP5 Audio **v0.15.0-alpha** (public Beta polish / QA hardening)  
**Target:** Future **Beta** (not yet released — this doc is a gate checklist, not a Beta launch announcement)

MP5 remains **experimental Alpha** until this checklist is satisfied and a Beta tag is explicitly chosen.

---

## Required checks before Beta

Run the full pre-release gate:

```bash
pnpm install
pnpm wasm:build          # once per machine / CI image
pnpm beta:check          # golden fixtures + docs audit + alpha:check + build + deploy:check
```

| Step | Command / artifact | Must pass |
|------|-------------------|-----------|
| Unit + integration tests | `pnpm test` (via beta:check / alpha:check) | ✅ |
| E2E browser tests | `pnpm test:e2e` (via alpha:check) | ✅ |
| Playback regression | `pnpm playback:check` | ✅ |
| Golden fixtures | `pnpm fixtures:validate` + embedded album validate | ✅ |
| Rust codec tests | `cargo test -p mp5-codec --release` | ✅ |
| Production build | `pnpm build` | ✅ |
| Deploy dist | `pnpm deploy:check` | ✅ |
| Manual QA | [`MP5_MANUAL_QA_CHECKLIST.md`](MP5_MANUAL_QA_CHECKLIST.md) | Manual |
| Known issues published | [`MP5_KNOWN_ISSUES.md`](MP5_KNOWN_ISSUES.md) | ✅ |
| Public claims audit | README, landing, demo guide — no overclaim | ✅ |
| Hosted demo smoke | [`MP5_HOSTED_DEMO.md`](MP5_HOSTED_DEMO.md) | Manual |

---

## Public demo smoke (hosted)

- [ ] Version badge shows current alpha (e.g. v0.15.0-alpha)
- [ ] Compact landing + tabs without expanding About
- [ ] Try MP5-L demo loads and plays
- [ ] Demo tab: embedded album demo (if fixture deployed)
- [ ] Converter and Player tabs reachable on mobile width
- [ ] PWA manifest + icons
- [ ] Synthetic fixtures only — no copyrighted deploy assets
- [ ] Optional: `pnpm hosted:verify` after deploy

---

## What must NOT be claimed

- Beats MP3 / AAC / Opus / FLAC
- Production-ready for all users
- Legally verified / DRM enforcement
- AI stem separation
- Universal player support
- Perfect compression

---

## Format UX (v0.14+)

| Format | Status |
|--------|--------|
| `.mp5` | Core smart song — MP5-L v3 recommended |
| `.mp5p` manifest | Experimental — sidecar `.mp5` required |
| `.mp5p` embedded | Experimental — lazy load; can be large |

See [`MP5_ALBUM_PACKAGE.md`](MP5_ALBUM_PACKAGE.md), [`MP5_EMBEDDED_PACKAGE.md`](MP5_EMBEDDED_PACKAGE.md).

---

## Codec policy (unchanged)

| Codec | Beta stance |
|-------|-------------|
| **MP5-L v3** | Default / recommended distribution codec |
| **PCM** | Reference / debug only |
| **MP5-C** | Lab-only — label hiss risk; never default |
| **MP5-H** | Optional hybrid — large; CORR required for clean path |

---

## Deployment status

| Item | Status |
|------|--------|
| Vercel demo | https://mp5-audio.vercel.app |
| PWA | Service worker + large WASM precache |
| HTTPS | Required for install / fixtures |
| Synthetic audio only | No copyrighted assets in repo |

See [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md).
