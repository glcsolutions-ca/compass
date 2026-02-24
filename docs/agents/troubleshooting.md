# Troubleshooting

## `docs-drift` Failure

- Cause: docs-critical paths changed without doc target updates.
- Where it appears: `scope` job in `commit-stage.yml`.
- Fix: update required docs (`docs/commit-stage-policy.md`, `.github/workflows/README.md`, or matching targets in policy).

## `codex-review-trusted` Failure

- Cause: trusted review workflow failed to fetch PR diff data or review output failed validation.
- Fix: rerun `codex-review-trusted.yml` manually when you want supplemental trusted feedback; it is non-blocking.

## `commit-stage-gate` Failure

- Cause: required commit-stage check outcomes did not succeed, docs-drift was blocking, or commit-stage SLO was in `enforce` mode and exceeded target.
- Fix: rerun failed required checks on latest commit and ensure docs-drift targets are updated when policy-critical paths changed.

## `acceptance-stage-gate` Failure

- Cause: required acceptance check outcomes did not succeed for the candidate scope, candidate digest contract failed, or identity config contract failed.
- Fix: inspect `.artifacts/acceptance/<sha>/result.json` and rerun acceptance after fix-forward.

## Stale Candidate in Production Stage

- Cause: candidate SHA was no longer current `main` when auto promotion started.
- Fix: allow next accepted candidate to promote, or run a manual replay with explicit `candidate_sha` when appropriate.
