# Commit Stage Policy Contract

This repository enforces deterministic trunk-first quality controls with policy in `.github/policy/pipeline-policy.json`.

## Objective

Every push to `main` must produce fast, deterministic gate evidence:

1. Change scope is resolved (`runtime`, `desktop`, `infra`, `identity`, `migration`, `docsOnly`).
2. Scope-required checks run and report.
3. `commit-stage` and `integration-gate` both pass before downstream release promotion.

`pull_request` runs remain optional preview signals.

## Source of Truth Precedence

When docs and implementation differ, implementation wins:

- Policy truth: `.github/policy/pipeline-policy.json`
- Commit-stage truth: `.github/workflows/commit-stage.yml` and `scripts/pipeline/commit/decide-commit-stage.mjs`
- Integration-gate truth: `.github/workflows/integration-gate.yml` and `scripts/pipeline/commit/decide-integration-gate.mjs`

## Required Gate Contexts

- `commit-stage`
- `integration-gate`

## Trigger Contract

- `commit-stage.yml`
  - `push` to `main`
  - optional `pull_request` types: `opened`, `synchronize`, `reopened`, `ready_for_review`
- `integration-gate.yml`
  - `push` to `main`
  - optional `pull_request` types: `opened`, `synchronize`, `reopened`, `ready_for_review`

## Commit-Stage Checks

- `determine-scope` (always)
- `commit-test-suite` (runtime/infra/identity/deployment-pipeline-config changes)
- `desktop-commit-test-suite` (desktop changes when not docs-only)
- `infra-static-check` (infra changes)
- `identity-static-check` (identity changes)
- `commit-stage` final decision (deterministic reason codes + timing SLO evaluation)

## High-Risk Local Policy

High-risk changes are enforced by local static policy `HR001`:

- high-risk path categories are defined in `highRiskMainlinePolicy` within `.github/policy/pipeline-policy.json`
- commits on `main` that touch high-risk paths are blocked locally and routed to PR + CODEOWNER review
- CODEOWNER target is policy-driven (`highRiskMainlinePolicy.codeOwners`)

## Integration-Gate Checks

- `determine-scope` (always)
- `build-compile` (runtime/infra/identity/deployment-pipeline-config changes on push)
- `migration-safety` (migration changes on push)
- `auth-critical-smoke` (runtime/infra/identity/deployment-pipeline-config changes on push)
- `minimal-integration-smoke` (runtime changes on push)
- `integration-gate` final decision

## Docs Drift

`docs-drift` is always evaluated in commit-stage and integration-gate:

- blocking when docs-critical paths change without required doc target updates
- advisory for deployment-pipeline-config drift without doc target updates

Artifact:

- `.artifacts/docs-drift/<testedSha>/result.json`

## Commit-Stage Timing SLO

Policy fields:

- `commitStage.slo.targetSeconds` (current: `300`)
- `commitStage.slo.mode` (`observe` or `enforce`)

Artifact:

- `.artifacts/commit-stage/<testedSha>/timing.json`

When mode is `enforce`, over-target runs fail `commit-stage`.

## Integration-Gate Throughput Telemetry

Integration-gate emits throughput telemetry on push runs:

- `.artifacts/integration-gate/<testedSha>/timing.json`

## Mainline Red Recovery

`main-red-recovery.yml` listens for completed `Commit Stage` and `Integration Gate` push runs on `main`:

- first hard deterministic failure: rerun failed jobs once
- repeated hard deterministic failure: auto-revert head commit

Artifact:

- `.artifacts/main-recovery/<sha>/result.json`
