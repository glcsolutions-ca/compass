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
pnpm db:migrate:up
pnpm db:migrate:status
pnpm db:migrate:down -- 1
```

## CI Behavior

`runtime-acceptance` provisions PostgreSQL as a service, applies migrations, runs `pnpm db:seed`, then executes `pnpm test:full`.
