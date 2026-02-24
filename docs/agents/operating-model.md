# Operating Model

Compass uses a deterministic 3-stage delivery pipeline.

## Core Rules

1. Commit stage is fast and merge-blocking.
2. Acceptance stage validates the frozen candidate and returns a single yes/no result.
3. Production stage deploys the accepted candidate only (no runtime rebuilds).
4. `commit-stage` is the single required branch-protection check.

## Key Terms

- `SHA`: unique commit fingerprint used across artifacts and release evidence.
- `Candidate`: frozen digest refs + scope metadata created on `main` commit stage.
- `Replay`: rerun acceptance/production for the same candidate SHA to prove repeatability.

## Canonical Stage Dependencies

1. `commit-stage.yml` runs `determine-scope`, `fast-feedback`, optional infra/identity static checks, then `commit-stage`.
2. `deployment-pipeline.yml` runs on `push main` and reuses commit-stage checks before promotion.
3. Deployment pipeline candidate freeze emits `.artifacts/candidate/<sha>/manifest.json`.
4. Deployment pipeline acceptance jobs load that candidate, run scope-based acceptance checks, and enforce candidate/config contracts.
5. Deployment pipeline production mutates only accepted candidate refs, then verifies and records release evidence.
6. Final decision artifact is `.artifacts/release/<sha>/decision.json`.
