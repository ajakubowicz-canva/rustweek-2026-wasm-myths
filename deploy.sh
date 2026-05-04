#!/bin/bash
set -e

# This script changes the base paths of the JavaScript assets such that the GitHub page is deployed
# correctly.


REPO_PATH="/rustweek-2026-wasm-myths"
HEAD_HBS="theme/head.hbs"

restore_head() {
  [[ -f "$HEAD_HBS.bak" ]] && mv "$HEAD_HBS.bak" "$HEAD_HBS"
}
trap restore_head EXIT

# Build JS with the GitHub Pages base path
(cd javascript && npx vite build --base "${REPO_PATH}/js/")

# Patch head.hbs for the deploy path, build, then restore
sed -i.bak "s|src=\"/js/|src=\"${REPO_PATH}/js/|g" "$HEAD_HBS"
mdbook build --dest-dir book-dist
mv "$HEAD_HBS.bak" "$HEAD_HBS"


# Deploy to github
cd book-dist
git init
git remote add origin git@github.com:ajakubowicz-canva/rustweek-2026-wasm-myths.git
git add -A
git commit -m "deploy"
git push origin HEAD:gh-pages -f
cd ..