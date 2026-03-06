#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"

npx --yes localtunnel --port "$PORT"
