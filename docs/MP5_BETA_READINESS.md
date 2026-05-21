# MP5 Beta readiness checklist

**Current version:** MP5 Audio **v0.10.0-alpha** (QA hardening milestone)  
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
| Golden fixtures | `pnpm fixtures:validate` + `validate-golden-fixtures.mjs` | ✅ |
| Rust codec tests | `cargo test -p mp5-codec --release` | ✅ |
| Production build | `pnpm build` | ✅ |
| Deploy dist | `pnpm deploy:check` | ✅ |
| Chunk registry current | [`MP5_CHUNK_REGISTRY.md`](MP5_CHUNK_REGISTRY.md) | ✅ |
| Known issues published | [`MP5_KNOWN_ISSUES.md`](MP5_KNOWN_ISSUES.md) | ✅ |
| Public claims audit | README, landing, demo guide — no overclaim | ✅ |
| Hosted demo smoke | [`MP5_HOSTED_DEMO.md`](MP5_HOSTED_DEMO.md) | Manual |

---

## Codec policy (unchanged)

| Codec | Beta stance |
|-------|-------------|
| **MP5-L v3** | Default / recommended distribution codec |
| **PCM** | Reference / debug only |
| **MP5-C** | Lab-only — label hiss risk; never default |
| **MP5-H** | Optional hybrid — large; CORR required for clean path |

---

## File format compatibility status

| Format | Alpha status | Beta requirement |
|--------|--------------|----------------|
| `.mp5` single track | HEAD + AUDI required; optional chunks forward-compatible | Stable parse/write for v0.9+ golden fixtures |
| `.mp5p` album manifest | Experimental sidecar package | Document limitations; manifest v1 frozen |
| STEM/STDA/STDF | Optional; full mix in AUDI required; large sets use **STDF** fragments | No breaking STEM/STDA/STDF v1 without migration doc |
| Unknown optional chunks | Safe to ignore | Must remain true |

Validate: `pnpm inspect:mp5 <file>` (stem storage **stda-v1** / **stdf-v1**, STDF fragment count) · `pnpm validate:mp5 <file> --profile rich`

---

## Deployment status

| Item | Status |
|------|--------|
| Vercel demo | https://mp5-audio.vercel.app |
| PWA | Service worker + large WASM precache |
| HTTPS | Required for install / fixtures |
| Synthetic audio only | No copyrighted assets in repo |

See [`MP5_DEPLOYMENT_GUIDE.md`](MP5_DEPLOYMENT_GUIDE.md).

---

## Testing requirements

- **331+** vitest tests passing (including `tests/betaReadiness.test.ts`, `tests/specFreezeCompatibility.test.ts`)
- **40** Playwright e2e tests passing
- Compatibility pass: `pnpm compatibility:check` (synthetic WAV/MP5)
- Stem fixture WASM decode validation in alpha:check
- Public landing copy tests — no “beats MP3” claims

---

## What must NOT be claimed publicly

Do **not** say or imply:

- MP5 beats MP3, AAC, Opus, or FLAC  
- MP5 is production-ready or industry-standard  
- Rights metadata is legally verified or enforced  
- AI stem separation, AI lyrics, or AI mood tagging ships in the product  
- MP5 is recovery-only or a medical/wellness device  
- Beta has shipped (until version policy says so)  

**Do** say:

- Experimental **Alpha** (or Beta when explicitly released)  
- **MP5-L v3** recommended; **MP5-C** lab-only; **MP5-H** hybrid/large  
- Optional metadata and features; browser-local library  
- Informational credits/rights only; no DRM  

---

## Known blockers before Beta

| Blocker | Severity | Notes |
|---------|----------|-------|
| MP5-C audible hiss | High for product story | Keep lab-only; no Beta default |
| MP5-L vs FLAC size | Medium | Document ~0.95× PCM; no competitive claim |
| Third-party ecosystem | High | No external players — set expectations |
| Strict HASH CLI | Low | Player verifies; CLI strict profile partial |
| `.mp5p` sidecar UX | Medium | Manual paths; missing cover file refs |
| Moonshot chunks | Low | Registry-only FourCCs remain skip-only |
| Mobile RAM / long files | Medium | Guardrails only — not a hard guarantee |

Full list: [`MP5_KNOWN_ISSUES.md`](MP5_KNOWN_ISSUES.md) · [`CURRENT_MP5_STATUS.md`](CURRENT_MP5_STATUS.md)

---

## Beta:check behavior

`pnpm beta:check` runs:

1. Container build  
2. Golden fixture validation (demo + compatibility when generated)  
3. Beta readiness unit tests  
4. Full `pnpm alpha:check` (fixtures, vitest, rust, e2e)  
5. `pnpm build`  
6. `pnpm deploy:check`  

This is intentionally slower than `pnpm test` alone — use before a release tag or hosted demo promotion.

---

## Sign-off template (manual)

- [ ] `pnpm beta:check` green on clean machine  
- [ ] Hosted demo smoke per MP5_HOSTED_DEMO.md  
- [ ] README version matches package.json  
- [ ] No copyrighted audio in deploy bundle  
- [ ] Stakeholder accepts MP5-C lab-only and no codec superiority claims  
