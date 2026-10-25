# portal/www — source of https://www.x-connect.ai

Until this directory existed, the live homepage was **only** a Cloudflare Pages
upload (project `xconnect-portal`) and lived nowhere in git.

## History of this directory
1. **Commit 1 — "snapshot of live"**: byte-for-byte what `www.x-connect.ai` served on
   2026-10-26 (36 files). `SHA256SUMS.live-2026-10-26.txt` lists the hashes; they were
   re-verified against the live site after copying.
2. **Commit 2 — "v9/v10 pending changes"**: the not-yet-deployed local builds `deploy_wwwxc_v9`
   (Refuel modal + `refuel.css/js`) and `deploy_wwwxc_v10` (balance page + `balance.css/js`).
   Review this commit to see exactly what a production deploy would change.

## What is in it
Static, no build step. `index.html` + `portal.css` / `portal.js` (hero, auth card, sign-up),
`auth.js` (Supabase email/OAuth/passkey from the browser), `i18n.js` (runtime 8-language swap),
`topup.js` / `topup.css` (USDT top-up page), `providers.js`, `sso.js`, `service-details.js`,
`service-content.json`, `carousel-*`, `facade-theme.css`, `assets/`.

## Secret review (done before committing)
Searched for private keys, `sk_*`, `ghp_`/`github_pat_`, JWTs, `service_role`, AWS/Slack tokens,
PEM blocks: **none found**. Public-by-design values that ARE present:
- Supabase project URL + **publishable** (`sb_publishable_…`) key in `auth.js` — meant for browsers.
- USDT **receiving** wallet address in `topup.js` and the two QR SVGs under `assets/topup/` — public by design.
Nothing was stripped. Do not add service-role keys, Stripe secret keys or webhook secrets here.

## Deploy (Martin only — not done by this PR)
```
wrangler pages deploy portal/www --project-name xconnect-portal --branch <preview-branch>   # preview first
```
Production = the same command with `--branch main` (project production branch), **only after Martin's OK**.
Live drift note: the live site currently equals commit 1; `/privacy /terms /source /pricing /redeem /download`
soft-404 to the homepage until the H06 PR is deployed.
