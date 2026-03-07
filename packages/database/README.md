# Database

Purpose: migrations, local Postgres runtime, and seed workflow for the canonical repository layout.

## Start Here

- migrations: `packages/database/migrations/**`
- migration scripts: `packages/database/scripts/**`
- local runtime: `packages/database/postgres/**`

## Run

```bash
pnpm --filter @compass/database run postgres:up
pnpm --filter @compass/database run migrate:check
pnpm --filter @compass/database run migrate:up
pnpm --filter @compass/database run migrate:status
pnpm --filter @compass/database run postgres:down
```

## Source Of Truth

- `docs/architecture/repository-boundaries.md`
- `docs/adr/0001-canonical-product-first-monorepo.md`
