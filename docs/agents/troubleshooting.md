# Troubleshooting

## `docs-drift` Failure

- Cause: docs-critical paths changed without required doc updates.
- Where it appears: `determine-scope` job in `commit-stage.yml` and `integration-gate.yml`.
- Fix: update required docs (`docs/commit-stage-policy.md`, `.github/workflows/README.md`, or mapped policy targets).

## `commit-stage` Failure

- Cause: required fast checks failed, docs-drift blocked, or commit-stage SLO was enforced and missed.
- Fix: inspect `.artifacts/commit-stage/<sha>/result.json`, fix forward on `main`, and push a corrective commit.

## `integration-gate` Failure

- Cause: integration checks failed (`build-compile`, `migration-safety`, `runtime-contract-smoke`, or `minimal-integration-smoke`).
- Fix: inspect `.artifacts/integration-gate/<sha>/result.json`, fix forward on `main`, and push a corrective commit.

## `automated-acceptance-test-gate` Failure

- Cause: required acceptance checks failed for current release candidate scope, release candidate contract failed, or identity config contract failed.
- Fix: inspect `.artifacts/automated-acceptance-test-gate/<sha>/result.json`, fix forward, and re-run delivery.

## `deployment-stage` Failure

- Cause: deployment-stage mutation or post-deployment verification gate failed for an accepted release candidate.
- Fix: inspect `.artifacts/deployment-stage/<sha>/result.json` and `.artifacts/release/<sha>/decision.json`, then fix forward or run `cloud-deployment-pipeline-replay.yml` with `release_candidate_sha`.

## `codex-review-trusted` Failure

- Cause: trusted review workflow failed to fetch PR diff data or review output validation failed.
- Fix: rerun `codex-review-trusted.yml` manually when you want supplemental feedback; it is non-blocking.
