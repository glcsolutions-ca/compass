# Pipeline

This folder is the canonical delivery system model for Compass.

## Farley Stage Order

1. `01-commit`
2. `02-acceptance`
3. `03-nonfunctional` (optional)
4. `04-manual-or-staging` (optional)
5. `05-release`

## Ownership Boundaries

- `.github/workflows` orchestrates CI/CD execution.
- `pipeline/contracts` defines release candidate and evidence contracts.
- `pipeline/shared/scripts` contains reusable pipeline mechanics.
- `pipeline/stages/*` contains stage-specific scripts, tests, and runbooks.

## Invariants

1. Build once in commit stage.
2. Promote digest-pinned candidate unchanged.
3. Acceptance evidence gates release.
4. Release and rollback use the same automated mechanisms.
