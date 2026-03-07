# Scripts

## `platform/scripts/bootstrap`

Admin-only scripts for the one-time and infrequent control-plane/bootstrap tasks.

## `platform/scripts/infra`

Production support-infrastructure helpers used by the release workflow and admin bootstrap.

## `platform/scripts/dev`

Local development and validation helpers.

Manual tooling for the unified session-host prototype lives in
`platform/scripts/dev/session-prototype`.

- Local development uses the local API plus a locally spawned session agent and
  a smoke test against `/v1/threads/...` and `/v1/runtime/...`.
- Cloud parity validation uses the same API/runtime contract with Azure Dynamic
  Sessions and a stable public API URL.
