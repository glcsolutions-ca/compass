# Operating Model

Compass uses a deterministic 3-stage delivery pipeline.

## Core Rules

1. Commit stage is fast and merge-blocking.
2. Acceptance stage validates the frozen candidate and returns a single yes/no result.
3. Production stage deploys the accepted candidate only (no runtime rebuilds).
4. `commit-stage-gate` is the single required branch-protection check.

## Key Terms

- `SHA`: unique commit fingerprint used across artifacts and release evidence.
- `Candidate`: frozen digest refs + scope metadata created on `main` commit stage.
- `Replay`: rerun acceptance/production for the same candidate SHA to prove repeatability.

## Canonical Stage Dependencies

1. `commit-stage.yml` runs `scope`, `quick-feedback`, optional infra/identity quick checks, then `commit-stage-gate`.
2. Successful commit stage on `main` emits `.artifacts/candidate/<sha>/manifest.json`.
3. `acceptance-stage.yml` loads that candidate and runs required scope-based acceptance jobs.
4. `acceptance-stage-gate` is the acceptance yes/no decision.
5. `production-stage.yml` loads accepted evidence, runs stale guard, mutates production, then verifies and records release evidence.
