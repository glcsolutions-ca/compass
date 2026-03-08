# Compass

Compass is a product-first TypeScript monorepo with three primary surfaces:

- `apps/api`: Express API
- `apps/web`: browser host
- `apps/desktop`: Electron host

The shared frontend application lives in `packages/client-app`. Shared UI, contracts, generated clients, data tooling, and runtime helpers live in `packages/*`. Delivery and infrastructure live in `platform/*`.

## Repository shape

```text
apps/
  api/
  web/
  desktop/

packages/
  client-app/
  ui/
  contracts/
  sdk/
  database/
  runtime-agent/
  runtime-protocol/
  shared/
  testing/

platform/
  infra/
  pipeline/
  scripts/

tests/
  acceptance/
```

## Core commands

- `pnpm install`
- `pnpm dev`
- `pnpm check`
- `pnpm check:commit`
- `pnpm test:acceptance`
- `pnpm check:pipeline`

## Product boundaries

- `apps/*` own platform entrypoints and host-specific adapters
- `packages/client-app` owns the shared frontend routes, screens, loaders, and feature logic
- `packages/ui` owns reusable UI primitives
- `packages/contracts` defines the HTTP contract
- `packages/sdk` is generated from the contract
- `packages/database` owns migrations and local postgres tooling
- `platform/*` owns delivery and infrastructure only

## Testing

- unit tests are colocated beside source as `*.test.ts(x)`
- black-box acceptance tests live in `tests/acceptance/{api,web,desktop}`
- delivery validation and evidence stay in `platform/pipeline`

## Docs

- architecture: `docs/architecture/repository-boundaries.md`
- ADR: `docs/adr/0001-canonical-product-first-monorepo.md`
- local development: `docs/runbooks/local-development.md`
- delivery pipeline: `docs/runbooks/delivery-pipeline.md`
- bootstrap and admin setup: `bootstrap/README.md`
