#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-compass-spike-codex-ci-001}"
NO_WAIT="${NO_WAIT:-true}"

args=(--name "$RESOURCE_GROUP" --yes --only-show-errors)

if [[ "$NO_WAIT" == "true" ]]; then
  args+=(--no-wait)
fi

az group delete "${args[@]}"
