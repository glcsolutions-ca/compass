# Scripts

## `scripts/bootstrap`

Admin-only scripts for the one-time and infrequent control-plane/bootstrap tasks.

## `scripts/infra`

Production support-infrastructure helpers used by the release workflow and admin bootstrap.

## `scripts/dev`

Local development and validation helpers.

Manual Azure session-pool spike tooling for the Codex relay experiment lives in
`scripts/dev/codex-session-poc`. It is intentionally outside the delivery
pipeline.

Manual tooling for the unified session-host prototype lives in
`scripts/dev/session-prototype`.

- Local development uses the local API plus a locally spawned session agent and
  a smoke test against `/v1/agent/...`.
- Cloud parity validation uses the same API/runtime contract with Azure Dynamic
  Sessions and a stable public API URL.
