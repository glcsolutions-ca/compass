# Commit Pipeline Scripts

Purpose: commit-stage and integration-gate decision and policy checks.

## Start Here

- `resolve-scope.mjs`
- `check-testing-policy.mjs`
- `check-docs-drift.mjs`
- `check-doc-quality.mjs`
- `decide-commit-stage.mjs`
- `decide-integration-gate.mjs`

## Local Checks

```bash
pnpm ci:scope
pnpm ci:testing-policy
pnpm ci:docs-drift
pnpm ci:doc-quality
```

## Source Of Truth

- `.github/workflows/commit-stage.yml`
- `.github/workflows/integration-gate.yml`
- `.github/policy/pipeline-policy.json`
