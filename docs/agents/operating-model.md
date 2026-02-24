# Operating Model

Compass uses deterministic Deployment Pipelines with the same 3-stage model.

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
2. `deployment-pipeline.yml` runs on `push main` for cloud runtime/infra/identity.
3. `desktop-deployment-pipeline.yml` runs on `push main` for desktop installers.
4. Cloud candidate freeze emits `.artifacts/candidate/<sha>/manifest.json`.
5. Cloud acceptance jobs load that candidate, run scope-based acceptance checks, and enforce candidate/config contracts.
6. Cloud production mutates only accepted candidate refs, then verifies and records release evidence.
7. Final cloud decision artifact is `.artifacts/release/<sha>/decision.json`.
8. Final desktop decision artifact is `.artifacts/desktop-release/<sha>/decision.json`.
