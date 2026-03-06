#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="${CONTROL_PLANE_CACHE_DIR:-${TMPDIR:-/tmp}/compass-codex-session-poc/local-control-plane}"
PORT="${PORT:-8787}"

mkdir -p "$CACHE_DIR"

if [[ ! -d "$CACHE_DIR/node_modules/ws" ]]; then
  npm init -y --prefix "$CACHE_DIR" >/dev/null 2>&1
  npm install --prefix "$CACHE_DIR" ws@8 >/dev/null 2>&1
fi

CONTROL_PLANE_CACHE_DIR="$CACHE_DIR" PORT="$PORT" node "$SCRIPT_DIR/local-control-plane.mjs"
