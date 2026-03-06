#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-compass-spike-codex-ci-001}"
LOCATION="${LOCATION:-westus3}"
SESSION_POOL="${SESSION_POOL:-sp-compass-codex-node-poc-001}"
CONTAINER_TYPE="${CONTAINER_TYPE:-NodeLTS}"
MAX_SESSIONS="${MAX_SESSIONS:-2}"
READY_SESSIONS="${READY_SESSIONS:-0}"
COOLDOWN_PERIOD="${COOLDOWN_PERIOD:-300}"

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --only-show-errors \
  --output json

az containerapp sessionpool create \
  --name "$SESSION_POOL" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --container-type "$CONTAINER_TYPE" \
  --network-status EgressEnabled \
  --cooldown-period "$COOLDOWN_PERIOD" \
  --max-sessions "$MAX_SESSIONS" \
  --ready-sessions "$READY_SESSIONS" \
  --only-show-errors \
  --output json
