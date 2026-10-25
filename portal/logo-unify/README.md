# Unify logo: transparent crystal X (www.x-connect.ai)

Martin's decision: the whole site uses ONLY the crystal X. `crystal-x.jpg` (black background, "Grok" corner mark) is replaced by a transparent cut-out `crystal-x.png`; the flat cyan X (`assets/icons/apple-icon.png`) and the three-material sheet (`assets/x-materials-review.png`: silver/blue/rose X used for the brand mark and Chat/Code entry icons) are removed and no longer referenced.

The live www source is NOT in git, so this is a patch against the deployed Pages build (`deploy_wwwxc_v4b` = SSO build v4 + `portal.js?v=6` linking to `https://factory.x-connect.ai/`; the patch does not touch `portal.js`, so that fix is preserved) plus asset files.

## Files here
- `portal_logo_unify.patch`: `diff -u` for `index.html`, `portal.css`, `facade-theme.css` (paths `a/` `b/`, apply with `-p1`).
- `assets/crystal-x.png` (1024x1024 RGBA, trimmed + padded square), `assets/crystal-x-1408.png` (original 1408 canvas, same position as the jpg).
- `assets/icons/`: `favicon-16/32/48.png`, `favicon.ico` (16/32/48), `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` (not linked; there is no web manifest on www), `og-image.png` (1200x630, X on solid black, NOT transparent on purpose).
- `favicon.ico`: same ico, goes to the site root.

## Apply (exact steps)

    cp -r <current-www-build> v5 && cd v5            # base must be the v4b build (the one in production)
    patch -p1 < <repo>/portal/logo-unify/portal_logo_unify.patch
    R=<repo>/portal/logo-unify
    cp $R/assets/crystal-x.png $R/assets/crystal-x-1408.png assets/
    cp $R/assets/icons/* assets/icons/
    cp $R/favicon.ico favicon.ico
    rm -f assets/crystal-x.jpg assets/x-materials-review.png assets/icons/apple-icon.png
    # regenerate SHA256SUMS.json (sha256 of every file except itself), then deploy as usual

Built copy on the bot box: `/workspace/deploy_wwwxc_v5` = v4b + this patch + assets (not deployed).

## Binary assets in this branch
The GitHub connector used to push this branch is text-only, so the PNG/ICO files are committed as ONE base64 tarball `_logo_assets.tgz.b64`. Run `bash portal/logo-unify/decode_assets.sh` from a checkout: it creates `portal/logo-unify/assets/*`, `portal/logo-unify/favicon.ico`, and the root-level `assets/crystal-x.png`, `assets/icons/*`, `favicon.ico` used by the legacy landing page. (`crystal-x-1408.png` is not in the tarball; it is only on the bot box at `/workspace/outputs/logo_unify/`.) Delete the `.b64` and the script afterwards.

## What the patch changes
- `index.html`: `<link rel=icon>` -> favicon.ico + 16/32/48 png; `apple-touch-icon` -> `assets/icons/apple-touch-icon.png` (180); `og:image` -> `https://www.x-connect.ai/assets/icons/og-image.png` (+type/width/height); `twitter:card` -> `summary_large_image` and new `twitter:image` (same og image); the four hidden `<img src="assets/crystal-x.jpg">` inside `.jewel` -> `crystal-x.png`.
- `portal.css`: `.jewel::before` background is `assets/crystal-x.png` (`contain`), removing the 300%-wide material sheet and the per-colour `background-position` rules.
- `facade-theme.css`: the three per-colour filters (silver/blue/rose) become one drop-shadow so brand, Chat and Code marks are identical.

## Notes
- Transparent PNG on iOS: apple-touch-icon is transparent as requested, iOS fills transparency with black.
- Cut-out: alpha from the brightest channel (soft), colours un-premultiplied, glow/halo and floor reflection removed, "Grok" corner mark removed (alpha 0 there). Dark navy facet interiors become semi-transparent; the darkest remaining pixels are mid blue, none black.
- Repo root also gets `assets/crystal-x.png`, `assets/icons/*`, `favicon.ico` for the legacy landing `index.html` on `main` (its inline SVG ring-X brand mark is replaced by the crystal X image).
