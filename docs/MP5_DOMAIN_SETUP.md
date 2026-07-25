# MP5 Custom Domain Setup (mp5audio.com)

**Domain:** `mp5audio.com`
**Registrar / DNS:** Cloudflare
**Vercel project:** `mp5-audio` (team `cjocollins-projects`)
**Current production URL:** https://mp5-audio.vercel.app

This is the procedure for pointing `mp5audio.com` at the `mp5-audio` Vercel
project. Both sides of the change — the Vercel project and the Cloudflare zone —
have to be done from their dashboards; there is no committed configuration in
this repo that controls domain assignment.

## Current State

Verified against public DNS:

| Check | Result |
|-------|--------|
| Nameservers | `hunts.ns.cloudflare.com`, `jean.ns.cloudflare.com` (zone is active on Cloudflare) |
| `mp5audio.com` A record | none |
| `www.mp5audio.com` CNAME | none |
| Domains on Vercel project `mp5-audio` | `*.vercel.app` only — no custom domain attached |

So the zone is delegated and ready; nothing points anywhere yet.

## Step 1 — Add the Domain in Vercel

Vercel first, so it can tell you the exact records to create.

1. Vercel dashboard → project **mp5-audio** → **Settings** → **Domains**.
2. Add `mp5audio.com`.
3. When prompted for the redirect behaviour, choose to also add `www.mp5audio.com`
   and redirect it to the apex. That makes `mp5audio.com` canonical and gives
   `www` a 308 to it.
4. Vercel then shows the DNS records it expects. **Use the values Vercel shows**
   — they can be region-specific and take precedence over the defaults below.

## Step 2 — Create the DNS Records in Cloudflare

Cloudflare dashboard → zone **mp5audio.com** → **DNS** → **Records**.

| Type | Name | Content | Proxy status | TTL |
|------|------|---------|--------------|-----|
| A | `@` | `76.76.21.21` | **DNS only** (grey cloud) | Auto |
| CNAME | `www` | `cname.vercel-dns-0.com` | **DNS only** (grey cloud) | Auto |

`76.76.21.21` and `cname.vercel-dns-0.com` are Vercel's general-purpose values.
If the Vercel Domains panel shows something different, that panel wins.

Alternative for the apex: Cloudflare supports CNAME flattening at the root, so a
`CNAME @ → cname.vercel-dns-0.com` also works and survives any future change to
Vercel's anycast IP. Only use it if Vercel's verification check accepts it —
Vercel verifies against the record it asked for.

### Proxy status must be "DNS only"

This is the step that most often breaks a Cloudflare → Vercel setup. Leave both
records grey-clouded:

- Vercel terminates TLS and issues its own Let's Encrypt certificate. With the
  orange cloud on, Vercel's HTTP-01 challenge is answered by Cloudflare's edge
  instead of Vercel, so certificate issuance and domain verification fail.
- With Cloudflare's SSL mode set to **Flexible**, proxying also produces an
  infinite redirect loop: Cloudflare talks to Vercel over HTTP, Vercel 308s to
  HTTPS, and the cycle repeats.

If the domain must be proxied later for Cloudflare features, the SSL/TLS
encryption mode has to be **Full (strict)**, and the certificate has to be issued
before the proxy is turned on. Plain "DNS only" is the supported configuration
and the one to use here.

## Step 3 — Verify

Propagation is usually a minute or two on a fresh Cloudflare zone.

```bash
# Records resolve to Vercel
curl -sS -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=mp5audio.com&type=A'
curl -sS -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=www.mp5audio.com&type=CNAME'

# Apex serves the app over a valid certificate
curl -sSI https://mp5audio.com

# www redirects to the apex (expect 308 + location: https://mp5audio.com/)
curl -sSI https://www.mp5audio.com
```

In Vercel, the Domains panel should show `mp5audio.com` as **Valid
Configuration** with a certificate issued.

Then run the repo's hosted checks against the new host:

```bash
MP5_HOSTED_URL=https://mp5audio.com pnpm hosted:verify
MP5_HOSTED_URL=https://mp5audio.com pnpm test:e2e:hosted
```

## Step 4 — Switch the Canonical URL in the Repo

Only after the checks in step 3 pass. Until then the app should keep pointing at
`mp5-audio.vercel.app`, which still works — Vercel keeps serving the `.vercel.app`
URLs after a custom domain is attached.

- `apps/web/src/lib/publicLinks.ts` — `MP5_DEMO_URL`
- `docs/MP5_VERCEL_SETUP.md` — production URL and `MP5_HOSTED_URL` examples
- `scripts/vercel-config-check.mjs` — the dashboard hint printed at the end
- Remaining `mp5-audio.vercel.app` references in `docs/` and `README.md`

```bash
grep -rn 'mp5-audio\.vercel\.app' --exclude-dir=node_modules .
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Vercel stuck on "Invalid Configuration" | records proxied, or value doesn't match what Vercel asked for | set both records to DNS only; copy the exact value from the Vercel Domains panel |
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare proxy on + SSL mode Flexible | grey-cloud the records (or move to Full (strict)) |
| Certificate never issues | orange cloud intercepting the ACME challenge | grey-cloud, then hit **Refresh** in the Vercel Domains panel |
| Apex works, `www` 404s | `www` never added as a domain in Vercel | add `www.mp5audio.com` in Vercel and set it to redirect to the apex |
| Old `.vercel.app` content on the new domain | service worker cache | hard-refresh; the app's SW updates on next load |

## Related Docs

- [Vercel project setup](MP5_VERCEL_SETUP.md)
- [Deployment guide](MP5_DEPLOYMENT_GUIDE.md)
- [Hosted demo validation](MP5_HOSTED_DEMO.md)
