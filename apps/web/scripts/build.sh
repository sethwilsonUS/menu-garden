#!/usr/bin/env bash
# Compatibility shim for Vercel projects whose Root Directory is set to apps/web.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

bash "$REPO_ROOT/scripts/build.sh"
