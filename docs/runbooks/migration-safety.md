# Migration Safety Runbook

## Policy

Deploy-time migrations must remain compatible with the current app image and the previous rollback image.
Use an expand/migrate/contract sequence.
Pipeline migration job is the only production migration path.
Deploy pipeline runs migration before API/Web rollout and fails closed on migration errors.
Do not run migrations at API startup or in init containers.

## Command-Level Role Separation

- API and migration share the same container image.
- API runtime command: `node dist/index.js`
- Migration job command: `node db/scripts/migrate.mjs up`
- This keeps one immutable release artifact per commit while preserving separate execution roles.

## Migration File Format

- Migration files must use ESM exports (`export const up/down`) because the runtime image is Node ESM (`"type": "module"`).
- CommonJS migration syntax (`exports.up/down`) will fail in the ACA migration job and block deploy promotion.

## Allowed In Deploy Gate (Expand)

- Create new tables
- Add nullable columns
- Add non-breaking indexes and constraints

## Separate Jobs

- Backfills and data reshaping run as separate jobs
- Large backfills should not block deployment unless explicitly required
- Do not merge API and Web into a single sidecar deployment to run migrations.
- Do not move migration execution into app startup hooks.

## Deferred Contract Steps

- Column/table drops
- incompatible renames
- hard non-null constraints without prior backfill

Run contract-only changes after full traffic cutover and stability period.

## Concurrency Controls

- Deploy workflow is serialized by `concurrency` in `.github/workflows/deploy.yml`
- Migration execution is single-run via ACA Job manual trigger config (`parallelism=1`, `replicaCompletionCount=1`)

## Diagnostics Contract

- Deploy migration artifacts are emitted at `.artifacts/deploy/<sha>/migration.json` with:
  - `reasonCode`/`reason` on failures
  - `executionStatus` and `executionSummary`
  - `statusTimeline` and elapsed timing fields
  - `logs` + `logsSource` for operator triage
- API smoke artifacts are emitted at `.artifacts/deploy/<sha>/api-smoke.json` with:
  - `reasonCode`/`reason`
  - assertion IDs and failed-assertion detail
  - bounded authorized-retry timeline for auth propagation windows
  - response status/text snippets for `health`, unauthorized, and authorized calls

## Recovery

- First response: redeploy the previous known-good image tag
- Database disaster recovery: use Azure PostgreSQL backup/PITR procedures
