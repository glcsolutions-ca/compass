# Postgres Local Runbook

## Purpose

This repository treats migrations as the source of truth for PostgreSQL schema.
Local seed data is optional convenience for dev/testing only.

## Standard Local Flow

```bash
pnpm db:postgres:up
pnpm dev
```

`db:postgres:up` performs four steps:

1. Starts Docker PostgreSQL.
2. Waits for readiness.
3. Applies migrations from `db/migrations/`.
4. Runs generic seed loading from `db/seeds/*.sql` (no-op if no seed files exist).

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

`db:migrate:up` enforces migration policy checks before executing and runs with explicit migration safety defaults:

- `--check-order`
- advisory lock enabled (`--lock`)
- single-transaction mode (`--single-transaction`)
- session safety via `PGOPTIONS` (`lock_timeout`, `statement_timeout`)

## CI Behavior

`runtime-blackbox-acceptance` starts PostgreSQL in a Docker network, runs migrations and seed through the release candidate API image, then executes black-box API/system/browser smoke checks against release candidate containers.
