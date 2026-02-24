# Troubleshooting

## `docs-drift` Failure

- Cause: docs-critical paths changed without required doc updates.
- Where it appears: `determine-scope` job in `commit-stage.yml` and `merge-queue-gate.yml`.
- Fix: update required docs (`docs/commit-stage-policy.md`, `.github/workflows/README.md`, or mapped policy targets).

## `commit-stage` Failure

- Cause: required PR fast checks failed, docs-drift blocked, or commit-stage SLO was enforced and missed.
- Fix: rerun failed checks on latest PR commit and update docs when policy-critical paths changed.

## `merge-queue-gate` Failure

- Cause: exact merge checks failed (`build-compile`, `migration-safety`, `auth-critical-smoke`, or `minimal-integration-smoke`).
- Fix: inspect `.artifacts/merge-queue-gate/<sha>/result.json`, fix forward in PR, and re-queue.

## `acceptance-stage` Failure

- Cause: required acceptance checks failed for current release package scope, release package contract failed, or identity config contract failed.
- Fix: inspect `.artifacts/acceptance/<sha>/result.json`, fix forward, and re-run delivery.

## `production-stage` Failure

- Cause: production mutation or post-deploy verification failed for an accepted release package.
- Fix: inspect `.artifacts/production/<sha>/result.json` and `.artifacts/release/<sha>/decision.json`, then fix forward or run `cloud-delivery-replay.yml` with `release_package_sha`.

## `codex-review-trusted` Failure

- Cause: trusted review workflow failed to fetch PR diff data or review output validation failed.
- Fix: rerun `codex-review-trusted.yml` manually when you want supplemental feedback; it is non-blocking.
