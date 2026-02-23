# Database

All database concerns live under this directory.

## Structure

- `migrations/`: schema and migration files.
- `scripts/`: migration/seed helper scripts used by local workflows and deploy jobs.
- `seeds/`: optional local development seed SQL files.
- `postgres/docker-compose.yml`: local PostgreSQL service definition.

## Baseline Behavior

- Migration and seed tooling remain active by default.
- Seed execution is generic and no-ops when no `.sql` seed files exist.
- Product/domain tables should be introduced only through explicit migrations.

## Common Commands

- `pnpm db:postgres:up`
- `pnpm db:postgres:down`
- `pnpm db:migrate:create -- <migration_name>`
- `pnpm db:migrate:up`
- `pnpm db:migrate:status`
- `pnpm db:seed`
