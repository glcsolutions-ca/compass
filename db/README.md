# Database

All database concerns live under this directory.

## Structure

- `migrations/`: schema and migration files.
- `scripts/`: migration/seed helper scripts used by local workflows and deploy jobs.
- `seeds/`: local development seed SQL files.
- `postgres/docker-compose.yml`: local PostgreSQL service definition.

## Common Commands

- `pnpm db:postgres:up`
- `pnpm db:postgres:down`
- `pnpm db:migrate:create -- <migration_name>`
- `pnpm db:migrate:up`
- `pnpm db:migrate:status`
- `pnpm db:seed`
