# Workflows

Purpose: workflow file contract for deterministic delivery.

Canonical model: `docs/development-pipeline.md`.

## Workflow Files

- `commit-stage.yml`: fast pre-merge quality gate on `pull_request` and `merge_group`.
- `acceptance-stage.yml`: Farley acceptance stage on `pull_request` and `merge_group`, including package-once and parallel integration/staging rehearsal.
- `cloud-deployment-pipeline.yml`: production promotion on `push` to `main` using the tested release candidate manifest from `acceptance-stage` (no rebuild).
- `cloud-deployment-pipeline-replay.yml`: manual replay by `release_candidate_sha`.
- `dynamic-sessions-acceptance-rehearsal.yml`: manual acceptance rehearsal by SHA.
- `desktop-deployment-pipeline.yml`: desktop release path.
- `labeler.yml`: advisory PR scope/risk labels.

## Required Status Contexts

- `commit-stage`
- `acceptance-stage`

## Cloud Artifact Contract

- `.artifacts/release-candidate/<sha>/manifest.json`
- `.artifacts/infra/<sha>/deployment.json`
- `.artifacts/deploy/<sha>/api-smoke.json`
- `.artifacts/release/<sha>/decision.json`
- `.artifacts/pipeline/<sha>/timing.json`

## Source Of Truth

- `docs/development-pipeline.md`
- `docs/commit-stage-policy.md`
- `docs/runbooks/cloud-deployment-pipeline-setup.md`
