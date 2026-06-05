# MP5 Beta readiness checklist

**Current version:** MP5 Audio **v0.15.6-alpha** (hosted demo lock / Beta candidate prep)  
**Target:** Future **Beta** tag — this doc is a gate checklist, not a Beta launch announcement.

MP5 remains **experimental Alpha** until this checklist is satisfied and a Beta tag is explicitly chosen.

---

## Beta candidate decision (May 2026)

### What is stable enough for Beta?

| Area | Status at v0.15.6-alpha |
|------|-------------------------|
| MP5-L v3 playback + converter | Stable for synthetic and user-owned files |
| Karaoke / LYRC sync | Stable on demo fixtures; manual QA on real files still advised |
| Embedded `.mp5p` albums | **Accepted** — HADES-scale manual test passes (cover, durations, Play Album, playlist hydrate, no overlap) |
| Manifest `.mp5p` + sidecars | MVP stable with calm missing-file UX |
| Local library (IndexedDB) | Stable per-browser; no sync |
| Hosted demo (https://mp5-audio.vercel.app) | **Accepted** — deploy + `hosted:verify` + `test:e2e:hosted` pass |
| Automated gates | `pnpm test` (444), `pnpm build`, `pnpm deploy:check`, `pnpm playback:check`, `pnpm beta:check` pass locally (May 2026 — **75/75 e2e** via beta:check) |

### What still blocks Beta?

| Blocker | Notes |
|---------|--------|
| **MP5-C transparency** | Lab-only; hiss on music — not distribution-ready |
| **No third-party ecosystem** | No mainstream player support |
| **Mobile / memory limits** | Large stems and ~700 MB embedded albums can exhaust RAM |
| **Browser-only product** | No native app; PWA is optional install |
| **Manual QA matrix** | [`MP5_MANUAL_QA_CHECKLIST.md`](MP5_MANUAL_QA_CHECKLIST.md) not fully signed off on all target browsers |
| **Legal / rights** | Metadata is informational only — no verification pipeline |
| **Performance at scale** | Batch queues and very large libraries untested at Beta scale |

### What stays intentionally Alpha / experimental?

- **MP5-C** and **MP5-H** — research / lab paths only  
- **`.mp5p` packages** — manifest and embedded formats experimental  
- **Stems** — manual import only; no AI separation  
- **Fingerprint / HASH** — duplicate detection, not DRM or legal proof  
- **Compression claims** — MP5 does **not** claim to beat MP3, AAC, Opus, or FLAC  

### Manual QA still required before tagging Beta

1. Complete [`MP5_MANUAL_QA_CHECKLIST.md`](MP5_MANUAL_QA_CHECKLIST.md) on Chrome + one mobile browser.  
2. Smoke hosted demo after each production deploy (`pnpm hosted:verify`).  
3. Re-run `pnpm beta:check` on the release commit.  
4. Review [`MP5_KNOWN_ISSUES.md`](MP5_KNOWN_ISSUES.md) — no new P0 regressions.  
5. Explicit maintainer decision to tag **Beta** (not automatic from this milestone).

**Recommendation:** MP5 Audio is ready for a **Beta candidate milestone** (internal tag + expanded tester invite), not a public **production** release. Tag **Beta** only after manual QA sign-off and a short hosted re-verify.

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
| Hosted demo smoke | [`MP5_HOSTED_DEMO.md`](MP5_HOSTED_DEMO.md) | Manual + automated |

---

## Public demo smoke (hosted)

**Canonical URL:** https://mp5-audio.vercel.app  
**Last hosted lock:** May 2026 — **v0.15.6-alpha** production deploy accepted.

- [x] Version badge shows **v0.15.6-alpha** (hosted e2e)
- [x] `pnpm hosted:verify` — HTTP smoke pass
- [x] `pnpm test:e2e:hosted` — 3/3 pass
- [ ] Compact landing + tabs without expanding About (manual)
- [ ] Try MP5-L demo loads and plays (manual)
- [ ] Demo tab: embedded album demo (manual)
- [ ] Converter and Player tabs reachable on mobile width (manual)
- [x] PWA manifest + icons (automated)
- [x] Synthetic fixtures only — no copyrighted deploy assets in repo
- [x] WASM + FFmpeg assets load (automated)

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
| Vercel demo | https://mp5-audio.vercel.app — **v0.15.6-alpha** (May 2026) |
| PWA | Service worker + large WASM precache |
| HTTPS | Required for install / fixtures |
| Synthetic audio only | No copyrighted assets in repo |

See [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md).
