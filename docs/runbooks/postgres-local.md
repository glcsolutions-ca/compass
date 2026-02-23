# Postgres Local Runbook

## Purpose

This repository treats migrations as the source of truth for PostgreSQL schema.
Local seed data is a convenience for dev/testing only.

## Standard Local Flow

```bash
pnpm db:postgres:up
pnpm dev
```

`db:postgres:up` performs four steps:

1. Starts Docker PostgreSQL.
2. Waits for readiness.
3. Applies migrations from `db/migrations/`.
4. Seeds demo data from `db/seeds/001_consolidated_employee_views.sql`.

Stop services:

```bash
pnpm db:postgres:down
```

Reset database state (drop volume, recreate schema, reseed):

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

`ci-pipeline` provisions PostgreSQL as a service, applies migrations, seeds data, and runs
`pnpm --filter @compass/api test:integration` before the normal pipeline command.
