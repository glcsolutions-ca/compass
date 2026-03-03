# Pipeline

This folder is the canonical delivery system model for Compass.
It reflects a stage-first deployment pipeline aligned to Farley/Humble.

## Farley Stage Order

1. `01-commit-stage`
2. `02-automated-acceptance-test-stage`
3. `03-nonfunctional` (optional)
4. `04-production-rehearsal-stage` (optional but recommended)
5. `05-release-stage`

## Authoritative Flow

1. A new pipeline instance starts on trunk check-in (`main`).
2. `01-commit-stage` creates the canonical release candidate once.
3. `02-automated-acceptance-test-stage` deploys and tests that same candidate as the second major gate.
4. `04-production-rehearsal-stage` runs as a temporary placeholder evidence gate.
5. `05-release-stage` deploys that accepted candidate to production without rebuilding.

## Ownership Boundaries

- `.github/workflows` orchestrates CI/CD execution.
- `pipeline/contracts` defines release candidate and evidence contracts.
- `pipeline/shared/scripts` contains reusable pipeline mechanics.
- `pipeline/stages/*` contains stage-specific scripts, tests, and runbooks.

## Invariants

1. Build once in commit stage.
2. Promote digest-pinned candidate unchanged.
3. Acceptance evidence gates production rehearsal.
4. Rehearsal evidence gates release.
5. Release and rollback use the same automated mechanisms.
6. Stage execution starts at `01-commit-stage`; no other stage creates release candidates.

## Temporary Baseline Notes

1. Acceptance currently runs on GitHub-hosted runner resources.
2. Worker runtime execution in acceptance is placeholder-only.
3. Production rehearsal is placeholder-only and will be replaced by real zero-traffic rehearsal.
