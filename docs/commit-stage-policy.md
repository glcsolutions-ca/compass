# Commit Stage Policy Contract

This repository enforces a deterministic commit-stage contract defined in `.github/policy/pipeline-policy.json`.

## Objective

Every PR to `main` must pass fast, reliable, merge-blocking evidence:

1. Change scope is resolved (`runtime`, `infra`, `identity`, `docsOnly`).
2. Required fast checks run based on scope.
3. Merge is allowed only when `commit-stage` passes.

`commit-stage.yml` runs for both `pull_request` and `merge_group` so the same commit-stage contract applies before merge and in queue execution.
`deployment-pipeline.yml` reuses the same commit-stage jobs on `push` to `main` before acceptance and production stages.

## Source of truth precedence

When this doc and implementation differ, implementation wins:

- Policy truth: `.github/policy/pipeline-policy.json`
- Enforcement truth: `.github/workflows/commit-stage.yml` and `scripts/pipeline/commit/decide-commit-stage.mjs`
- This doc is explanatory and must be kept aligned with those files.

## Single required branch-protection check

Branch protection requires only:

- `commit-stage`

`commit-stage` enforces required commit checks for the tested merge result on both PR and merge queue runs.

## Commit-stage checks

- `determine-scope` (always)
- `fast-feedback` (always)
- `infra-static-check` (only when `infra` scope is true)
- `identity-static-check` (only when `identity` scope is true)
- `docs-drift` is always evaluated and can block merge for docs-critical drift

## Scope model

`pipeline-policy.json` classifies changed files into:

- `runtime`
- `infra`
- `identity`
- `docsOnly`
- plus rollout flags (`migration`, `infraRollout`) used downstream

`changeClass` is derived in priority order: `runtime` -> `infra` -> `identity` -> `checks`.

## Docs drift

`docs-drift` is always evaluated.

- Blocking: docs-critical paths changed without matching docs target updates.
- Advisory: control-plane blocking paths changed without docs target updates.

Result artifact path:

- `.artifacts/docs-drift/<testedSha>/result.json`

## Commit-Stage SLO Telemetry

Policy fields:

- `commitStage.slo.targetSeconds` (current target: `300`)
- `commitStage.slo.mode` (`observe` or `enforce`)

Current mode is `enforce`.

- Over-target runs fail `commit-stage`.
- Timing evidence is still emitted for every run.

Timing artifact path:

- `.artifacts/commit-stage/<testedSha>/timing.json`

Timing keys:

- `metrics.time_to_commit_gate_seconds`
- `metrics.queue_delay_seconds`
- `metrics.quick_feedback_seconds`
- `metrics.total_run_seconds`

`time_to_commit_gate_seconds` is measured from first commit-stage job start to gate completion (execution time only). Queue delay is telemetry-only.

## Gate semantics

`commit-stage` makes merge decisions from required job outcomes (`needs.*.result`) plus docs-drift state.

- `determine-scope` must succeed.
- `fast-feedback` must succeed.
- `infra-static-check` must succeed when `infra` is required.
- `identity-static-check` must succeed when `identity` is required.
- If docs-drift blocking is true, docs-drift status must be `pass`.
- If `commitStage.slo.mode = enforce`, gate fails when timing SLO is not met.

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
