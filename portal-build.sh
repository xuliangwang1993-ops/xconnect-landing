#!/bin/sh
set -e
rm -rf portal && mkdir portal
cat portal-pkg/part* | base64 -d | tar xzf - -C portal
ls -R portal
