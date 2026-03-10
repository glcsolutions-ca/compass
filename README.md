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
- `pnpm dev:desktop`
- `pnpm test:integration`
- `pnpm test:acceptance`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm format`
- `pnpm format:check`
- `pnpm infra:apply`

Primary commands are self-sufficient. `pnpm dev`, `pnpm test:integration`, and
`pnpm test:acceptance*` start what they need from a cold local state, reuse a healthy `pnpm dev:up`
stack when one already exists, and clean up only what they started.

Use `pnpm dev:up` and `pnpm dev:down` only when you want to keep the shared local stack running
across multiple commands for speed.

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
- black-box acceptance tests live in `tests/acceptance/{api,web,desktop}`
- delivery validation and evidence stay in `platform/pipeline`

## Docs

- architecture: `docs/architecture/repository-boundaries.md`
- ADR: `docs/adr/0001-canonical-product-first-monorepo.md`
- local development: `docs/runbooks/local-development.md`
- delivery pipeline: `docs/runbooks/delivery-pipeline.md`
- bootstrap and admin setup: `bootstrap/README.md`
