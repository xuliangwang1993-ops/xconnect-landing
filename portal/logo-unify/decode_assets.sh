#!/bin/bash
# Binary logo assets are committed as one base64 tarball (the GitHub connector used for this push is text-only).
# Run from anywhere in a checkout:  bash portal/logo-unify/decode_assets.sh   -- then delete the .b64 and this script.
set -e
cd "$(dirname "$0")/../.."
base64 -d portal/logo-unify/_logo_assets.tgz.b64 | tar xz
mkdir -p assets/icons
cp portal/logo-unify/assets/crystal-x.png assets/crystal-x.png
for f in favicon-16.png favicon-32.png favicon-48.png apple-touch-icon.png; do cp portal/logo-unify/assets/icons/$f assets/icons/$f; done
cp portal/logo-unify/favicon.ico favicon.ico
sha256sum assets/crystal-x.png portal/logo-unify/assets/crystal-x.png portal/logo-unify/assets/icons/* favicon.ico
