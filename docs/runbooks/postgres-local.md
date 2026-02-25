# Postgres Local Runbook

## Purpose

This repository treats migrations as the source of truth for PostgreSQL schema.
Local seed data is optional convenience for dev/testing only.

## Standard Local Flow

```bash
pnpm db:postgres:up
pnpm dev
```

`pnpm db:postgres:*` and `pnpm dev` invoke local env bootstrap as part of those commands.
`pnpm dev` starts local core services (API/web/codex). Start worker separately with `pnpm dev:worker` when needed.

`db:postgres:up` performs five steps:

1. Runs `scripts/dev/ensure-local-env.mjs` to bootstrap API/Web/Codex env files plus `db/postgres/.env` and add missing required keys.
2. Starts Docker PostgreSQL.
3. Waits for readiness.
4. Applies migrations from `db/migrations/*.mjs` using explicit glob selection (`--use-glob`).
5. Runs generic seed loading from `db/seeds/*.sql` (no-op if no seed files exist).

Bootstrap uses this precedence for local values:

1. explicit shell env var
2. existing `.env` value
3. generated per-worktree default

Local Postgres compose values are sourced from `db/postgres/.env`:

- `COMPOSE_PROJECT_NAME`
- `POSTGRES_PORT`
- `DATABASE_URL`

`DATABASE_URL` resolution for migration/seed/wait scripts is:

1. process env `DATABASE_URL`
2. `db/postgres/.env` `DATABASE_URL`
3. derived `postgres://compass:compass@localhost:$POSTGRES_PORT/compass`
4. fallback `postgres://compass:compass@localhost:5432/compass`

Stop services:

```bash
pnpm db:postgres:down
```

Reset database state (drop volume, recreate schema, rerun optional seeds):

```bash
pnpm db:postgres:reset
```

## Migration Commands

```bash
pnpm db:migrate:create -- <migration_name>
pnpm db:migrate:check
pnpm db:migrate:checksums:update
pnpm db:migrate:up
pnpm db:migrate:status
```

`db:migrate:create` emits strict migration files using:

- filename pattern: `^\d{17}_[a-z0-9_]+\.mjs$`
- extension: `.mjs` only
- checksums auto-refresh in `db/migrations/checksums.json`

`db:migrate:up` loads migration files explicitly with `db/migrations/*.mjs` (not full-directory scanning).

`db:migrate:up` enforces migration policy checks before executing and runs with explicit migration safety defaults:

- `--check-order`
- advisory lock enabled (`--lock`)
- single-transaction mode (`--single-transaction`)
- session safety via `PGOPTIONS` (`lock_timeout`, `statement_timeout`)

## CI Behavior

`runtime-blackbox-acceptance` starts PostgreSQL in a Docker network, runs migrations and seed through the release candidate API image, then executes black-box API/system/browser smoke checks against release candidate containers.
