# Commit And Acceptance Stage Contract

Purpose: contract for how `commit-stage` and `acceptance-stage` decide pass/fail.

Canonical model: `docs/development-pipeline.md`.

## Source Of Truth

- Commit stage workflow: `.github/workflows/commit-stage.yml`
- Acceptance stage workflow: `.github/workflows/acceptance-stage.yml`

## Required Status Contexts

- `commit-stage`
- `acceptance-stage`

## Decision Inputs

- path classification (`dorny/paths-filter`)
- lane-required check outcomes
- merge-group staging rehearsal outcomes
- release-candidate digest contract (when deployment is required)

## Policy Rules

- High-risk boundaries are enforced by GitHub native controls: branch rulesets + CODEOWNERS.
- `acceptance-stage` is merge-group authoritative for release-candidate packaging.
- Promotion pipeline on `push main` is non-mutating and fix-forward.

## Artifacts

- `.artifacts/commit-stage/<sha>/scope.json`
- `.artifacts/commit-stage/<sha>/result.json`
- `.artifacts/acceptance-stage/<sha>/scope.json`
- `.artifacts/acceptance-stage/<sha>/result.json`
- `.artifacts/release-candidate/<sha>/manifest.json`
