# Commit Stage Scripts

## Purpose

`scripts/pipeline/commit/` contains fast, merge-blocking control logic used by `commit-stage.yml`.

## Script-To-Workflow Map

| Script                     | Used By Workflow                     | Role                                                                                      | Artifact                                      |
| -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| `resolve-scope.mjs`        | `.github/workflows/commit-stage.yml` | Resolve SHAs, classify scope (`runtime/infra/identity/docsOnly`), compute candidate kind. | `.artifacts/commit-stage/<sha>/scope.json`    |
| `check-testing-policy.mjs` | `pnpm test:static` and commit stage  | Enforce test placement/policy rules (`TC001`, `TC010`, `TC011`, `TC020`).                 | `.artifacts/testing-policy/<sha>/result.json` |
| `check-docs-drift.mjs`     | `.github/workflows/commit-stage.yml` | Evaluate docs drift against policy contract.                                              | `.artifacts/docs-drift/<sha>/result.json`     |
| `commit-stage-gate.mjs`    | `.github/workflows/commit-stage.yml` | Final commit-stage gate decision from required check outcomes and docs-drift state.       | `.artifacts/commit-stage/<sha>/result.json`   |

## Expected Artifacts

- `.artifacts/commit-stage/<sha>/scope.json`
- `.artifacts/commit-stage/<sha>/result.json`
- `.artifacts/commit-stage/<sha>/timing.json`
- `.artifacts/testing-policy/<sha>/result.json`
- `.artifacts/docs-drift/<sha>/result.json`

## Local Execution Notes

```bash
pnpm commit:scope
pnpm commit:testing-policy
pnpm commit:docs-drift
```

`pnpm commit:gate` expects CI-provided environment variables (`CHECK_RESULTS_JSON`, scope flags, docs-drift state, and SHA metadata).

Commit-stage timing/SLO collection is handled by `scripts/pipeline/shared/collect-stage-timing.mjs`.
