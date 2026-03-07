#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
SUBDOMAIN="${SUBDOMAIN:-}"

if [[ -n "$SUBDOMAIN" ]]; then
  npx --yes localtunnel --port "$PORT" --subdomain "$SUBDOMAIN"
  exit 0
fi

npx --yes localtunnel --port "$PORT"
