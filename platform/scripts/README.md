# Scripts

Day-to-day developer command entrypoints live in the root `scripts/` directory.

## `platform/scripts/bootstrap`

Admin-only scripts for the one-time and infrequent control-plane/bootstrap tasks.

## `platform/scripts/infra`

Production support-infrastructure helpers used by the release workflow and admin bootstrap.

## `platform/scripts/dev`

Specialized development tooling that is not part of the primary root command surface.

Manual tooling for the unified session-host prototype lives in
`platform/scripts/dev/session-prototype`.
