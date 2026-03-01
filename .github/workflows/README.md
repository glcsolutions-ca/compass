# Workflows

Purpose: workflow file contract for delivery automation.

Canonical model: `docs/development-pipeline.md`.

## Workflow Files

- `commit-stage.yml`: push to `main`, optional PR preview.
- `integration-gate.yml`: push to `main`, optional PR preview.
- `cloud-deployment-pipeline.yml`: push to `main`.
- `cloud-deployment-pipeline-replay.yml`: manual replay by `release_candidate_sha`.
- `dynamic-sessions-acceptance-rehearsal.yml`: manual acceptance rehearsal by SHA.
- `desktop-deployment-pipeline.yml`: desktop release path.

## Required Status Contexts

- `commit-stage`
- `integration-gate`

## Cloud Artifact Contract

- `.artifacts/release-candidate/<sha>/manifest.json`
- `.artifacts/infra/<sha>/deployment.json`
- `.artifacts/deploy/<sha>/api-smoke.json`
- `.artifacts/release/<sha>/decision.json`
- `.artifacts/pipeline/<sha>/timing.json`

## Source Of Truth

- `.github/policy/pipeline-policy.json`
- `docs/commit-stage-policy.md`
- `docs/runbooks/cloud-deployment-pipeline-setup.md`
