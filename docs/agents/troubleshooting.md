# Troubleshooting

## `docs-drift` Failure

- Cause: docs-critical paths changed without required doc updates.
- Where it appears: `determine-scope` job in `commit-stage.yml` and `integration-gate.yml`.
- Primary action: run the failing guardrail and execute the printed `DO:` commands exactly.
- Deep diagnostics: inspect `.artifacts/docs-drift/<sha>/result.json`.

## `commit-stage` Failure

- Cause: required fast checks failed, docs-drift blocked, or commit-stage SLO was enforced and missed.
- Primary action: run the failing guardrail and execute the printed `DO:` commands exactly.
- Deep diagnostics: inspect `.artifacts/commit-stage/<sha>/result.json`.

## `integration-gate` Failure

- Cause: integration checks failed (`build-compile`, `migration-safety`, `runtime-contract-smoke`, or `minimal-integration-smoke`).
- Primary action: run the failing guardrail and execute the printed `DO:` commands exactly.
- Deep diagnostics: inspect `.artifacts/integration-gate/<sha>/result.json`.

## `automated-acceptance-test-gate` Failure

- Cause: required acceptance checks failed for current release candidate scope, release candidate contract failed, or identity config contract failed.
- Primary action: run the failing guardrail and execute the printed `DO:` commands exactly.
- Deep diagnostics: inspect `.artifacts/automated-acceptance-test-gate/<sha>/result.json`.

## `deployment-stage` Failure

- Cause: deployment-stage mutation or post-deployment verification gate failed for an accepted release candidate.
- Primary action: run the failing guardrail and execute the printed `DO:` commands exactly.
- Deep diagnostics: inspect `.artifacts/deployment-stage/<sha>/result.json` and `.artifacts/release/<sha>/decision.json`.

## `codex-review-trusted` Failure

- Cause: trusted review workflow failed to fetch PR diff data or review output validation failed.
- Primary action: run the failing guardrail and execute the printed `DO:` commands exactly.
- Note: this workflow is non-blocking; use it for supplemental feedback.
