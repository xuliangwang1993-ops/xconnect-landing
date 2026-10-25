#!/bin/bash
# The GitHub connector used to push this branch is text-only, so the binary logo assets are committed
# as one base64 tarball. Run once from the repo root, then delete site/assets/_logo_assets.tgz.b64 and this script.
set -e
cd "$(dirname "$0")/.."
base64 -d site/assets/_logo_assets.tgz.b64 | tar xz
sha256sum site/assets/crystal-x.png site/assets/icons/* site/favicon.ico
