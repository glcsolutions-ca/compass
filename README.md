# Compass by GLC

One place to see work, time, and delivery across your company.

## Quick Start

Requirements:

- Node.js `24.x` (from `.nvmrc`; enforced by `engines >=24.8.0 <25`)
- pnpm `10.30.1`

```bash
pnpm install
pnpm dev
```

## Local Postgres (Standard Setup)

Start PostgreSQL with Docker Compose:

```bash
pnpm db:postgres:up
```

`pnpm db:postgres:up` does all local DB bootstrapping:

- starts Docker PostgreSQL
- waits for readiness
- applies migrations from `migrations/`
- seeds demo data from `db/postgres/seed/001_consolidated_employee_views.sql`

The API uses PostgreSQL whenever `DATABASE_URL` is set (see `apps/api/.env.example`):

```bash
DATABASE_URL=postgres://compass:compass@localhost:5432/compass
```

Stop the local database:

```bash
pnpm db:postgres:down
```

Reset local PostgreSQL state (drops volumes, reapplies migrations, reseeds):

```bash
pnpm db:postgres:reset
```

## Migration Workflow

Create a migration:

```bash
pnpm db:migrate:create -- <migration_name>
```

Apply migrations:

```bash
pnpm db:migrate:up
```

Rollback one migration:

```bash
pnpm db:migrate:down -- 1
```

View migration status:

```bash
pnpm db:migrate:status
```

## Doorway

- Contributor workflow: `CONTRIBUTING.md`
- Agent table of contents: `AGENTS.md`
- Merge policy (human): `docs/merge-policy.md`
- Branch protection setup: `docs/branch-protection.md`
- Merge policy (machine): `.github/policy/merge-policy.json`
- CI enforcement workflow: `.github/workflows/merge-contract.yml`

## Source of Truth

CI is authoritative for merge safety.
Local scripts are optional convenience for faster feedback.

Common local checks:

```bash
pnpm check
pnpm build
```
