# Commit Pipeline Scripts

Purpose: commit-stage local checks and commit-stage gate decision tooling.

## Start Here

- `check-testing-policy.mjs`
- `check-doc-quality.mjs`
- `decide-commit-stage.mjs`

## Local Checks

```bash
pnpm ci:testing-policy
pnpm ci:doc-quality
```

## Source Of Truth

- `.github/workflows/commit-stage.yml`
- `.github/workflows/acceptance-stage.yml`
