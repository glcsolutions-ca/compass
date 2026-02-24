# Commit Stage Scripts

## Purpose

`scripts/pipeline/commit/` contains PR fast-feedback and merge-queue gate control logic.

## Script-To-Workflow Map

| Script                            | Used By Workflow                           | Role                                                                                     | Artifact                                        |
| --------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `resolve-scope.mjs`               | `commit-stage.yml`, `merge-queue-gate.yml` | Resolve SHAs, classify scope (`runtime/infra/identity/docsOnly`), compute `changeClass`. | `.artifacts/commit-stage/<sha>/scope.json`      |
| `check-testing-policy.mjs`        | `pnpm test:static` and commit stage        | Enforce test placement/policy rules (`TC001`, `TC010`, `TC011`, `TC020`).                | `.artifacts/testing-policy/<sha>/result.json`   |
| `check-docs-drift.mjs`            | `commit-stage.yml`, `merge-queue-gate.yml` | Evaluate docs drift against policy contract.                                             | `.artifacts/docs-drift/<sha>/result.json`       |
| `decide-commit-stage.mjs`         | `.github/workflows/commit-stage.yml`       | Final commit-stage gate decision from required check outcomes and docs-drift state.      | `.artifacts/commit-stage/<sha>/result.json`     |
| `decide-merge-queue-gate.mjs`     | `.github/workflows/merge-queue-gate.yml`   | Final merge-queue gate decision for exact-merge checks and docs-drift state.             | `.artifacts/merge-queue-gate/<sha>/result.json` |
| `decide-merge-queue-gate-lib.mjs` | unit tests + merge queue gate              | Reason-code evaluator for exact merge gate decision.                                     | n/a                                             |

## Expected Artifacts

- `.artifacts/commit-stage/<sha>/scope.json`
- `.artifacts/commit-stage/<sha>/result.json`
- `.artifacts/commit-stage/<sha>/timing.json`
- `.artifacts/merge-queue-gate/<sha>/result.json`
- `.artifacts/testing-policy/<sha>/result.json`
- `.artifacts/docs-drift/<sha>/result.json`

## Local Execution Notes

```bash
pnpm commit:scope
pnpm commit:testing-policy
pnpm commit:docs-drift
```

`pnpm commit:stage` expects CI-provided environment variables (`CHECK_RESULTS_JSON`, scope flags, docs-drift state, and SHA metadata).

Commit-stage timing/SLO collection is handled by `scripts/pipeline/shared/collect-commit-stage-timing.mjs`.
