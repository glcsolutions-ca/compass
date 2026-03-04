# Pipeline

This folder defines the canonical deployment pipeline model for Compass.

## Intake (Not a Stage)

1. An agent or developer opens a PR.
2. `PR Intake (Auto-enable Merge when ready)` enables auto-merge for PRs targeting `main`.
3. `Commit Stage Intake` publishes a lightweight `Commit Stage` eligibility check on the PR head revision.
4. Merge queue creates a `merge_group` candidate when the PR is eligible.

## Farley Stage Order

1. `Commit Stage`
2. `Automated Acceptance Test Stage`
3. `Staging / Manual Test Stage` (currently implemented as a production rehearsal placeholder)
4. `Release Stage`

## Authoritative Flow

1. `Commit Stage` runs on `merge_group` and is the only pre-merge authoritative gate.
2. `Commit Stage` builds deployable artifacts once and publishes a digest-pinned release-candidate manifest.
3. If `Commit Stage` passes, merge queue merges the candidate to `main`.
4. `Automated Acceptance Test Stage` runs on `push` to `main`, fetches the exact candidate manifest by `candidateId`, deploys that candidate, and records acceptance evidence.
5. `Staging / Manual Test Stage` consumes that same candidate and evidence, records rehearsal evidence, and publishes output for release automation.
6. `Release Stage` verifies evidence integrity and deploys/promotes the same candidate without rebuilding.

## Ownership Boundaries

- `.github/workflows` orchestrates CI/CD execution.
- `pipeline/contracts` defines release-candidate and evidence contracts.
- `pipeline/shared/scripts` contains reusable pipeline mechanics.
- `pipeline/stages/*` contains stage-specific scripts, tests, and runbooks.

## Invariants

1. Build once in `Commit Stage`.
2. Promote digest-pinned candidate unchanged.
3. Stage evidence is separate from release-candidate identity.
4. `Release Stage` and rollback/redeploy use the same candidate mechanism.
5. Direct pushes that do not have a valid candidate manifest are fail-closed in post-merge stages.

## Temporary Baseline Notes

1. Acceptance currently runs on GitHub-hosted runner resources.
2. Worker runtime execution in acceptance is placeholder-only.
3. Staging / Manual Test Stage is currently a production rehearsal placeholder and will be replaced with real zero-traffic rehearsal automation.
