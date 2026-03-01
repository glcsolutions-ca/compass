# Troubleshooting

Purpose: fast diagnosis for common pipeline failures.

Canonical model: `../development-pipeline.md`.

## `docs-drift` Failure

- Cause: docs-critical path changed without required docs update.
- Check: `.artifacts/docs-drift/<sha>/result.json`.
- Fix: update `docs/development-pipeline.md`, `docs/commit-stage-policy.md`, `.github/workflows/README.md`, or another configured target.

## `commit-stage` Failure

- Cause: fast checks failed or docs drift blocked.
- Check: `.artifacts/commit-stage/<sha>/result.json`.
- Fix: correct the issue and push.

## `integration-gate` Failure

- Cause: integration checks failed.
- Check: `.artifacts/integration-gate/<sha>/result.json`.
- Fix: correct the issue and push.

## Cloud Pipeline Failure

- Cause: evidence verification, deploy, smoke, or release decision step failed.
- Check: `.artifacts/infra/<sha>/deployment.json`, `.artifacts/deploy/<sha>/api-smoke.json`, `.artifacts/release/<sha>/decision.json`.
- Fix: correct and rerun, or replay with `release_candidate_sha`.
