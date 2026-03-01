# Troubleshooting

Canonical model: `../development-pipeline.md`.

## `docs-drift` Failure

- Cause: docs-critical path changed without required docs updates.
- Fix: update `docs/development-pipeline.md`, `docs/commit-stage-policy.md`, `.github/workflows/README.md`, or another configured doc target.

## `commit-stage` Failure

- Cause: required fast checks failed or docs drift blocked.
- Fix: review `.artifacts/commit-stage/<sha>/result.json`, fix forward, push.

## `integration-gate` Failure

- Cause: integration checks failed.
- Fix: review `.artifacts/integration-gate/<sha>/result.json`, fix forward, push.

## Cloud Pipeline Failure

- Cause: evidence verification, deploy, smoke, or release-decision step failed.
- Fix: review `.artifacts/infra/<sha>/deployment.json`, `.artifacts/deploy/<sha>/api-smoke.json`, and `.artifacts/release/<sha>/decision.json`.
- Replay option: rerun `cloud-deployment-pipeline-replay.yml` with `release_candidate_sha`.
