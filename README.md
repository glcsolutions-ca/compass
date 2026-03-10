# Compass

Compass is a product-first TypeScript monorepo with three primary surfaces:

- `apps/api`: Express API
- `apps/web`: browser host
- `apps/desktop`: Electron host

The web application now lives directly in `apps/web/app`. Shared UI, contracts, generated clients,
data tooling, runtime helpers, and test utilities live in `packages/*`. Delivery and infrastructure
live in `platform/*`.

## Repository shape

```text
apps/
  api/
  web/
  desktop/

packages/
  contracts/
  sdk/
  database/
  runtime-agent/
  runtime-protocol/
  testkit/
  ui/

scripts/

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
- `pnpm verify`
- `pnpm acceptance`
- `pnpm platform:check`
- `pnpm platform:apply`
- `pnpm build`
- `pnpm format`
- `pnpm format:check`
- `pnpm dev:desktop`

`pnpm dev` is the fast source-mode loop. `pnpm verify` is the local Commit Stage and
`pnpm acceptance` is the local Acceptance Stage against the locally built candidate. `pnpm platform:check`
and `pnpm platform:apply` are the only public operator commands.

## Product boundaries

- `apps/*` own platform entrypoints and host-specific adapters
- `apps/web/app` owns the frontend routes, screens, loaders, and feature logic
- `packages/ui` owns reusable UI primitives
- `packages/contracts` defines the HTTP contract
- `packages/sdk` is generated from the contract
- `packages/database` owns migrations and local postgres tooling
- `packages/testkit` owns reusable test helpers and isolation guardrails
- `platform/*` owns delivery and infrastructure only

## Testing

- unit tests are colocated beside source as `*.test.ts(x)`
- black-box acceptance tests live in `tests/acceptance/{api,web}`
- delivery validation stays in `platform/pipeline`

## Docs

- architecture: `docs/architecture/repository-boundaries.md`
- ADR: `docs/adr/0001-canonical-product-first-monorepo.md`
- local development: `docs/runbooks/local-development.md`
- delivery pipeline: `docs/runbooks/delivery-pipeline.md`
- bootstrap and admin setup: `bootstrap/README.md`
