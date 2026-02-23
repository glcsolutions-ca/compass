# CI Scripts

## Purpose

`scripts/ci/` contains merge-policy and test-policy enforcement logic used by GitHub Actions gates.

## Script-To-Workflow Map

| Script                     | Used By Workflow                             | Role                                                                                  | Artifact                                              |
| -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `preflight.mjs`            | `.github/workflows/merge-contract.yml`       | Resolve SHAs, classify risk tier, compute required checks/docs-drift flags.           | `.artifacts/merge/<testedSha>/preflight.json`         |
| `testing-contract.mjs`     | `.github/workflows/merge-contract.yml`       | Enforce test placement/policy rules (`TC001`, `TC010`, `TC011`, `TC020`).             | `.artifacts/testing-contract/<testedSha>/result.json` |
| `docs-drift.mjs`           | `.github/workflows/merge-contract.yml`       | Evaluate docs drift against policy contract.                                          | `.artifacts/docs-drift/<testedSha>/result.json`       |
| `gate.mjs`                 | `.github/workflows/merge-contract.yml`       | Final risk-policy gate decision from required check outcomes and evidence validation. | `.artifacts/risk-policy-gate/<testedSha>/result.json` |
| `release-classify.mjs`     | `.github/workflows/deploy.yml`               | Classify `main` promotion as `checks`, `infra`, or `runtime`.                         | workflow outputs consumed by `deploy.yml` jobs        |
| `codex-review-trusted.mjs` | `.github/workflows/codex-review-trusted.yml` | Trusted-context optional review helper.                                               | `.artifacts/review-trusted/pr-<number>/...`           |

## Expected Artifacts

- `.artifacts/merge/<sha>/preflight.json`
- `.artifacts/testing-contract/<sha>/result.json`
- `.artifacts/docs-drift/<sha>/result.json`
- `.artifacts/risk-policy-gate/<sha>/result.json`
- `.artifacts/review-trusted/pr-<number>/...` (trusted review workflow only)

## Local Execution Notes

- Fast local preflight path:

```bash
pnpm ci:preflight
pnpm ci:testing-contract
pnpm ci:docs-drift
```

- `pnpm ci:gate` expects CI-provided environment variables (`CHECK_RESULTS_JSON`, tier flags, and SHA metadata). Use it locally only when reproducing gate failures with explicit env setup.
- Policy schema and runtime mode validation are implemented in `test-policy.mjs` and covered by `*.test.mjs` files in this folder.
