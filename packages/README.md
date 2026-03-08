# Packages

Purpose: shared foundations for product code, contracts, runtime integrations, and testing.

## Start Here

- `packages/contracts`
- `packages/sdk`
- `packages/database`
- `packages/ui`
- `packages/client-app`
- `packages/runtime-agent`
- `packages/runtime-protocol`
- `packages/shared`
- `packages/testing`

## Run

```bash
pnpm --filter @compass/contracts run generate
pnpm --filter @compass/sdk run generate
pnpm --filter @compass/database run migrate:check
```

## Source Of Truth

- `docs/architecture/repository-boundaries.md`
- `docs/adr/0001-canonical-product-first-monorepo.md`
