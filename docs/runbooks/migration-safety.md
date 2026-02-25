# Migration Safety Runbook

## Policy

Migration behavior is defined by [`migration-playbook.md`](./migration-playbook.md).
This runbook describes deploy-time safety controls and incident response.

- Pipeline migration job is the only production migration path.
- Deployment stage runs migration before API/Web/Codex rollout and fails closed on migration errors.
- Do not run migrations at API startup or in init containers.
- Current phase is forward-first and no backward-compat is required.

## Command-Level Role Separation

- API and migration share the same container image.
- API runtime command: `node dist/index.js`
- Migration job command: `node db/scripts/migrate.mjs up`
- This keeps one immutable release artifact per commit while preserving separate execution roles.

## Runtime Guardrails

- Migration policy is validated before execution (`pnpm db:migrate:check`).
- Runtime uses explicit ordering and lock controls (`--check-order`, `--lock`, `--single-transaction`).
- Session safety controls are enforced through job environment (`lock_timeout`, `statement_timeout`).
- Migration wait is bounded by `MIGRATION_TIMEOUT_SECONDS`.
- For operations requiring non-transaction mode (for example concurrent index creation), isolate the change in a dedicated migration.

## Concurrency Controls

- Production mutation is serialized by `concurrency: production-mutation` in `.github/workflows/cloud-deployment-pipeline.yml`.
- Migration execution is single-run via ACA Job manual trigger config (`parallelism=1`, `replicaCompletionCount=1`).

## Diagnostics Contract

- Migration artifacts are emitted at `.artifacts/deploy/<sha>/migration.json` with:
  - `reasonCode`/`reason` on failures
  - `executionStatus` and `executionSummary`
  - `statusTimeline` and elapsed timing fields
  - `logs` + `logsSource` for operator triage
- API smoke artifacts are emitted at `.artifacts/deploy/<sha>/api-smoke.json` with:
  - `reasonCode`/`reason`
  - assertion IDs and failed-assertion detail
  - bounded retry timeline for transient propagation windows
  - response status/text snippets for `health` and `openapi`

## Recovery

1. Rollout stops automatically on migration failure.
2. Inspect `.artifacts/deploy/<sha>/migration.json` and ACA job/container logs.
3. Fix forward with a new migration, or restore database and redeploy if required.
4. Replay a previously accepted release candidate SHA via `cloud-deployment-pipeline-replay.yml` when appropriate.
