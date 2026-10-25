# Homepage (www.x-connect.ai) cross-subdomain login patch

The live homepage source is not in git, so this is a patch against the deployed Pages build (`deploy_wwwxc_v3`, i.e. the login-gate build).

- `portal_sso_cookie_edits.patch`: edits to the built `auth.js` and `index.html` (`diff -u`, paths `a/` = v3 build, `b/` = new build).
- `sso.js`: new file, copy it next to `auth.js`. It is the same file as `site/sso.js` on branch `feat/sso-cookie-factory` (shared verbatim; keep in sync).

Apply to a copy of the current www build:

    cp -r <current-www-build> v4 && cd v4
    patch -p1 < portal_sso_cookie_edits.patch   # strips the a/ b/ prefixes
    cp <this-dir>/sso.js .

Built copy used for testing: `/workspace/deploy_wwwxc_v4` on the bot box (not deployed). Full combined patch: `/workspace/outputs/portal_sso_cookie.patch`.

See the factory PR for design, tests (26/26, mocked Supabase) and tradeoffs. Not deployed; not merged.
