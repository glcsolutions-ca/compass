# Commit Stage Policy Contract

This repository enforces deterministic merge readiness via `.github/policy/pipeline-policy.json`.

## Objective

Every PR to `main` must pass fast, reliable merge-readiness evidence:

1. Change scope is resolved (`runtime`, `desktop`, `infra`, `identity`, `docsOnly`).
2. Required fast checks run based on scope.
3. PRs are merge-ready only when `commit-stage` passes.

`commit-stage.yml` runs on `pull_request` and `merge_group`.
Heavy fast-feedback checks stay PR-only; merge-group runs emit required `commit-stage` context for queued merge SHAs without rerunning heavy suites.
Exact queued-merge validation is handled by `merge-queue-gate.yml` (full checks on `merge_group`).
Post-merge delivery pipelines (`cloud-delivery-pipeline.yml` for cloud, `desktop-deployment-pipeline.yml` for desktop) run on `push` to `main`.

## Source of Truth Precedence

When this doc and implementation differ, implementation wins:

- Policy truth: `.github/policy/pipeline-policy.json`
- PR gate truth: `.github/workflows/commit-stage.yml` and `scripts/pipeline/commit/decide-commit-stage.mjs`
- Merge queue gate truth: `.github/workflows/merge-queue-gate.yml` and `scripts/pipeline/commit/decide-merge-queue-gate.mjs`
- This doc is explanatory and must be kept aligned with those files.

## Required Gate Contexts

- `commit-stage` (PR quality gate)
- `merge-queue-gate` (exact merge queue gate)

## Trigger Contract

- `commit-stage.yml`
  - `pull_request` types: `opened`, `synchronize`, `reopened`, `ready_for_review`
  - `merge_group`
- `merge-queue-gate.yml`
  - `pull_request` types: `opened`, `synchronize`, `reopened`, `ready_for_review`
  - `merge_group`

## Commit-Stage Checks (PR Heavy Path)

- `determine-scope` (always)
- `fast-feedback` (when runtime/infra/identity is true, or when delivery config blocking paths changed)
- `desktop-fast-feedback` (when `desktop` scope is true and change is not docs-only)
- `infra-static-check` (only when `infra` scope is true)
- `identity-static-check` (only when `identity` scope is true)
- `docs-drift` is always evaluated and can block merge for docs-critical drift
- On `merge_group`, commit-stage runs scope/docs-drift/final decision only to keep required context satisfiable without rerunning heavy checks

## Merge Queue Gate Checks (Exact Merge)

- `determine-scope` (always)
- `build-compile` (runtime/infra/identity/delivery-config changes)
- `migration-safety` (when migrations changed)
- `auth-critical-smoke` (runtime/infra/identity/delivery-config changes)
- `minimal-integration-smoke` (runtime changes)
- `merge-queue-gate` final decision artifact
- merge-queue throughput telemetry artifact

## Scope Model

`pipeline-policy.json` classifies changed files into:

- `runtime`
- `desktop`
- `infra`
- `identity`
- `docsOnly`
- plus rollout flags (`migration`, `infraRollout`) used downstream

Scope evaluation excludes files matching `scopeRules.docsOnly` before computing mutable scopes (`runtime`, `desktop`, `infra`, `identity`) so documentation-only updates do not trigger delivery config mutation paths.

`changeClass` is derived in priority order: `runtime` -> `infra` -> `identity` -> `desktop` -> `checks`.

## Docs Drift

`docs-drift` is always evaluated.

- Blocking: docs-critical paths changed without matching docs target updates.
- Advisory: delivery config blocking paths changed without docs target updates.
- Infra auth runtime wiring changes (for example `OAUTH_TOKEN_SIGNING_SECRET` convergence) must include one of the configured docs-target updates.

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

## Merge Queue Throughput Telemetry

Merge queue throughput snapshot is emitted per `merge_group` run:

- `.artifacts/merge-queue-gate/<testedSha>/timing.json`

Snapshot keys include:

- `throughputWindow.queueDelaySeconds.median`
- `throughputWindow.queueDelaySeconds.p95`
- `throughputWindow.totalRunSeconds.median`
- `throughputWindow.totalRunSeconds.p95`
- `throughputWindow.rerunRatio`
- `throughputWindow.passRateByStage`

## PR Gate Semantics

`commit-stage` makes PR merge-readiness decisions from required job outcomes (`needs.*.result`) plus docs-drift state.

- `determine-scope` must succeed.
- `fast-feedback` must succeed when runtime/infra/identity commit evidence is required, or when delivery config paths changed.
- `desktop-fast-feedback` must succeed when desktop commit evidence is required.
- `infra-static-check` must succeed when `infra` is required.
- `identity-static-check` must succeed when `identity` is required.
- If docs-drift blocking is true, docs-drift status must be `pass`.
- If `commitStage.slo.mode = enforce`, gate fails when timing SLO is not met.

## Runtime Baseline

Delivery-config scripts use Node's built-in `path.posix.matchesGlob` for deterministic pattern behavior.

- Node baseline: `22.x` (`.nvmrc`)
- Engine contract: `>=22 <23`

## Delivery-Config High-Risk Paths

`docsDriftRules` and `scopeRules` in `.github/policy/pipeline-policy.json` are authoritative.

Non-exhaustive examples:

- `.github/workflows/*.yml`, `.github/workflows/*.yaml`
- `.github/policy/**`
- `scripts/pipeline/**`
- `infra/**`, `infra/azure/**`, `infra/identity/**`
- `db/migrations/**`, `db/scripts/**`
- `deploy/**`
