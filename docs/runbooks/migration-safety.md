# Migration Safety Runbook

## Policy

Deploy-time migrations must remain compatible with mixed app revisions during rollout.
Use an expand/migrate/contract sequence.

## Allowed In Deploy Gate (Expand)

- Create new tables
- Add nullable columns
- Add non-breaking indexes and constraints

## Separate Jobs

- Backfills and data reshaping run as separate jobs
- Large backfills should not block candidate promotion unless explicitly required

## Deferred Contract Steps

- Column/table drops
- incompatible renames
- hard non-null constraints without prior backfill

Run contract-only changes after full traffic cutover and stability period.

## Concurrency Controls

- Deploy workflow is serialized by `concurrency` in `.github/workflows/deploy.yml`
- Migration execution is single-run via ACA Job manual trigger config (`parallelism=1`, `replicaCompletionCount=1`)

## Recovery

- First response: rollback application traffic to previous revisions
- Database disaster recovery: use Azure PostgreSQL backup/PITR procedures
