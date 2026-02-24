# Commit Stage Policy Contract

This repository enforces a deterministic commit-stage contract defined in `.github/policy/pipeline-policy.json`.

## Objective

Every PR to `main` must pass fast, reliable, merge-blocking evidence:

1. Change scope is resolved (`runtime`, `infra`, `identity`, `docsOnly`).
2. Required quick checks run based on scope.
3. Merge is allowed only when `commit-stage-gate` passes.

`commit-stage.yml` runs for both `pull_request` and `merge_group` so the same commit-stage contract applies before merge and in queue execution.

## Source of truth precedence

When this doc and implementation differ, implementation wins:

- Policy truth: `.github/policy/pipeline-policy.json`
- Enforcement truth: `.github/workflows/commit-stage.yml` and `scripts/pipeline/commit/commit-stage-gate.mjs`
- This doc is explanatory and must be kept aligned with those files.

## Single required branch-protection check

Branch protection requires only:

- `commit-stage-gate`

`commit-stage-gate` enforces required commit checks for the tested merge result on both PR and merge queue runs.

## Commit-stage checks

- `scope` (always)
- `quick-feedback` (always)
- `infra-quick-check` (only when `infra` scope is true)
- `identity-quick-check` (only when `identity` scope is true)
- `docs-drift` is always evaluated and can block merge for docs-critical drift

## Scope model

`pipeline-policy.json` classifies changed files into:

- `runtime`
- `infra`
- `identity`
- `docsOnly`
- plus rollout flags (`migration`, `infraRollout`) used downstream

`kind` is derived in priority order: `runtime` -> `infra` -> `identity` -> `checks`.

## Docs drift

`docs-drift` is always evaluated.

- Blocking: docs-critical paths changed without matching docs target updates.
- Advisory: control-plane blocking paths changed without docs target updates.

Result artifact path:

- `.artifacts/docs-drift/<testedSha>/result.json`

## Gate semantics

`commit-stage-gate` makes merge decisions from required job outcomes (`needs.*.result`) plus docs-drift state.

- `scope` must succeed.
- `quick-feedback` must succeed.
- `infra-quick-check` must succeed when `infra` is required.
- `identity-quick-check` must succeed when `identity` is required.
- If docs-drift blocking is true, docs-drift status must be `pass`.

## Runtime baseline

Control-plane scripts use Node's built-in `path.posix.matchesGlob` for deterministic pattern behavior.

- Node baseline: `22.x` (`.nvmrc`)
- Engine contract: `>=22 <23`

## Control-plane high-risk paths

`docsDriftRules` and `scopeRules` in `.github/policy/pipeline-policy.json` are authoritative.

Non-exhaustive examples:

- `.github/workflows/*.yml`, `.github/workflows/*.yaml`
- `.github/policy/**`
- `scripts/pipeline/**`
- `infra/**`, `infra/azure/**`, `infra/identity/**`
- `db/migrations/**`, `db/scripts/**`
- `deploy/**`
