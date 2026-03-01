# Database

Purpose: migrations, local Postgres runtime, and seed workflow.

## Start Here

- migrations: `db/migrations/**`
- migration scripts: `db/scripts/**`
- local runtime: `db/postgres/**`

## Run

```bash
pnpm db:postgres:up
pnpm db:migrate:check
pnpm db:migrate:up
pnpm db:migrate:status
pnpm db:postgres:down
```

## Source Of Truth

- `docs/runbooks/postgres-local.md`
- `docs/runbooks/migration-runbook.md`
