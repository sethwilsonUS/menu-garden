#!/usr/bin/env bash
# Build script for Vercel production, preview, and local builds.
#
# - Production (VERCEL_ENV=production): deploys Convex functions to prod, then builds Next.js
# - Preview   (VERCEL_ENV=preview):    creates an isolated Convex preview deployment per branch and seeds the sample menu
# - Local     (no VERCEL_ENV):         builds the web app only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHARED_DIR="$REPO_ROOT/packages/shared"

WEB_BUILD_CMD="cd '$REPO_ROOT' && npm run build --workspace @menu-garden/web"
if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Production build: deploying Convex functions and building the web app"
  cd "$SHARED_DIR"
  npx convex deploy \
    --cmd "$WEB_BUILD_CMD" \
    --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL

elif [ "${VERCEL_ENV:-}" = "preview" ]; then
  BRANCH="${VERCEL_GIT_COMMIT_REF:-preview}"
  echo "Preview build: deploying Convex preview ($BRANCH), seeding the sample menu, and building the web app"
  cd "$SHARED_DIR"
  npx convex deploy \
    --cmd "$WEB_BUILD_CMD" \
    --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL \
    --preview-create "$BRANCH" \
    --preview-run menus:seedSampleMenu

else
  echo "Local build: building the web app only"
  cd "$REPO_ROOT"
  npm run build --workspace @menu-garden/web
fi
