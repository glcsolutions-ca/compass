# Database

Purpose: migrations, local Postgres runtime, and seed workflow.

## Start Here

- migrations: `db/migrations/**`
- migration scripts: `db/scripts/**`
- local runtime: `db/postgres/**`

## Run

```bash
pnpm --filter @compass/db-tools run postgres:up
pnpm --filter @compass/db-tools run migrate:check
pnpm --filter @compass/db-tools run migrate:up
pnpm --filter @compass/db-tools run migrate:status
pnpm --filter @compass/db-tools run postgres:down
```

## Source Of Truth

- `docs/runbooks/postgres-local.md`
- `docs/runbooks/migration-runbook.md`
