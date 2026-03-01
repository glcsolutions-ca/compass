# Commit Stage Policy Contract

Purpose: contract for how commit-stage and integration-gate decide pass/fail.

Canonical model: `development-pipeline.md`.

## Source Of Truth

- Policy: `.github/policy/pipeline-policy.json`
- Commit gate workflow: `.github/workflows/commit-stage.yml`
- Integration gate workflow: `.github/workflows/integration-gate.yml`
- Decision scripts:
  - `scripts/pipeline/commit/decide-commit-stage.mjs`
  - `scripts/pipeline/commit/decide-integration-gate.mjs`

## Required Status Contexts

- `commit-stage`
- `integration-gate`

## Decision Inputs

- scope classification
- required check outcomes
- docs drift status
- timing/SLO mode where configured

## Policy Rules

- `HR001` blocks high-risk direct commits to `main`.
- docs drift blocks docs-critical changes without required doc updates.
- artifacts are written under `.artifacts/**` for each gate.

## Artifacts

- `.artifacts/commit-stage/<sha>/result.json`
- `.artifacts/integration-gate/<sha>/result.json`
- `.artifacts/docs-drift/<sha>/result.json`
- `.artifacts/main-recovery/<sha>/result.json`
