# Troubleshooting

## `docs-drift` Failure

- Cause: docs-critical paths changed without doc target updates.
- Where it appears: `determine-scope` job in `commit-stage.yml`.
- Fix: update required docs (`docs/commit-stage-policy.md`, `.github/workflows/README.md`, or matching targets in policy).

## `codex-review-trusted` Failure

- Cause: trusted review workflow failed to fetch PR diff data or review output failed validation.
- Fix: rerun `codex-review-trusted.yml` manually when you want supplemental trusted feedback; it is non-blocking.

## `commit-stage` Failure

- Cause: required commit-stage check outcomes did not succeed, docs-drift was blocking, or commit-stage SLO was in `enforce` mode and exceeded target.
- Fix: rerun failed required checks on latest commit and ensure docs-drift targets are updated when policy-critical paths changed.

## `acceptance-stage` Failure

- Cause: required acceptance check outcomes did not succeed for the candidate scope, candidate digest contract failed, or identity config contract failed.
- Fix: inspect `.artifacts/acceptance/<sha>/result.json` and rerun `deployment-pipeline.yml` after fix-forward.

## `production-stage` Failure

- Cause: production mutation or post-deploy black-box verification failed for the accepted candidate.
- Fix: inspect `.artifacts/production/<sha>/result.json` and `.artifacts/release/<sha>/decision.json`, then fix-forward or replay with `candidate_sha`.
