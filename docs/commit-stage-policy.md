# Commit Stage Policy Contract

Canonical model: `development-pipeline.md`.

## Source Of Truth

- Policy: `.github/policy/pipeline-policy.json`
- Commit gate implementation: `.github/workflows/commit-stage.yml`
- Integration gate implementation: `.github/workflows/integration-gate.yml`
- Final decision scripts:
  - `scripts/pipeline/commit/decide-commit-stage.mjs`
  - `scripts/pipeline/commit/decide-integration-gate.mjs`

## Required Status Contexts

- `commit-stage`
- `integration-gate`

## Commit Stage Contract

`commit-stage` final decision is based on scope + required check outcomes + docs-drift state.

Required check set (policy-driven):

- `determine-scope`
- `commit-test-suite`
- `desktop-commit-test-suite`
- `commit-stage`

## Integration Gate Contract

`integration-gate` final decision is based on scope + required check outcomes + docs-drift state.

Required check set (policy-driven):

- `determine-scope`
- `build-compile`
- `migration-safety`
- `runtime-contract-smoke`
- `minimal-integration-smoke`
- `integration-gate`

## Docs Drift Contract

- Blocking when docs-critical paths change without required doc target updates.
- Advisory for deployment-pipeline-config drift without required doc target updates.
- Artifact: `.artifacts/docs-drift/<sha>/result.json`

## High-Risk Mainline Policy (`HR001`)

- Blocks direct `main` commits for policy-defined high-risk path categories.
- Routes high-risk changes to PR + CODEOWNER review.

## Timing And Recovery

- Commit-stage timing artifact: `.artifacts/commit-stage/<sha>/timing.json`
- Integration timing artifact: `.artifacts/integration-gate/<sha>/timing.json`
- Main red recovery artifact: `.artifacts/main-recovery/<sha>/result.json`
