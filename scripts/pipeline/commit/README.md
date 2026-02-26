# Commit Stage Scripts

## Purpose

`scripts/pipeline/commit/` contains trunk-first commit-stage and integration-gate control logic.

## Script-To-Workflow Map

| Script                                | Used By Workflow                           | Role                                                                                           | Artifact                                        |
| ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `resolve-scope.mjs`                   | `commit-stage.yml`, `integration-gate.yml` | Resolve SHAs, classify scope (`runtime/infra/identity/docsOnly`), compute `changeClass`.       | `.artifacts/commit-stage/<sha>/scope.json`      |
| `check-high-risk-mainline-policy.mjs` | `pnpm test:quick` + local git hooks        | Blocks `main` commits for high-risk staged paths (`HR001`) and prints PR + CODEOWNER guidance. | n/a                                             |
| `check-testing-policy.mjs`            | `pnpm test:quick` and commit stage         | Enforce test placement/policy rules (`TC001`, `TC010`, `TC011`, `TC020`).                      | `.artifacts/testing-policy/<sha>/result.json`   |
| `check-docs-drift.mjs`                | `commit-stage.yml`, `integration-gate.yml` | Evaluate docs drift against policy contract.                                                   | `.artifacts/docs-drift/<sha>/result.json`       |
| `decide-commit-stage.mjs`             | `.github/workflows/commit-stage.yml`       | Final commit-stage gate decision from required check outcomes and docs-drift state.            | `.artifacts/commit-stage/<sha>/result.json`     |
| `decide-integration-gate.mjs`         | `.github/workflows/integration-gate.yml`   | Final integration gate decision for push-main checks and docs-drift state.                     | `.artifacts/integration-gate/<sha>/result.json` |
| `decide-integration-gate-lib.mjs`     | unit tests + integration gate              | Reason-code evaluator for integration-gate decisions.                                          | n/a                                             |
| `auto-recover-main.mjs`               | `.github/workflows/main-red-recovery.yml`  | Reruns hard deterministic failures once, then auto-reverts repeated failures on `main`.        | `.artifacts/main-recovery/<sha>/result.json`    |

## Expected Artifacts

- `.artifacts/commit-stage/<sha>/scope.json`
- `.artifacts/commit-stage/<sha>/result.json`
- `.artifacts/commit-stage/<sha>/timing.json`
- `.artifacts/integration-gate/<sha>/result.json`
- `.artifacts/testing-policy/<sha>/result.json`
- `.artifacts/docs-drift/<sha>/result.json`
- `.artifacts/main-recovery/<sha>/result.json`

## Local Execution Notes

```bash
pnpm ci:scope
pnpm ci:testing-policy
pnpm ci:docs-drift
```

`pnpm ci:gate:commit-stage` expects CI-provided environment variables (`CHECK_RESULTS_JSON`, scope flags, docs-drift state, and SHA metadata).

Commit-stage timing/SLO collection is handled by `scripts/pipeline/shared/collect-commit-stage-timing.mjs`.
