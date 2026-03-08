# Local Development

Compass is a product-first monorepo. Local development should start from the product surfaces and only drop into platform tooling when you are working on delivery or infrastructure.

## Product surfaces

- `apps/api`: Express API for auth, workspaces, threads, and runtime endpoints
- `apps/web`: React Router web host
- `apps/desktop`: Electron host for the shared client app
- `packages/client-app`: shared frontend application used by web and desktop

## Core commands

- `pnpm install`
- `pnpm dev`
- `pnpm check`
- `pnpm check:commit`
- `pnpm test:acceptance`
- `pnpm check:pipeline`

## Package boundaries

- keep product logic in `apps/*` and `packages/*`
- keep shared UI in `packages/ui`
- keep HTTP contracts in `packages/contracts`
- keep generated clients in `packages/sdk`
- keep migrations and local postgres helpers in `packages/database`
- keep delivery and infra code in `platform/*`

## Testing model

- colocated unit tests live beside source as `*.test.ts(x)`
- black-box acceptance tests live under `tests/acceptance/{api,web,desktop}`
- pipeline and infra validation stays under `platform/`

## Local database helpers

- `pnpm --filter @compass/database run postgres:up`
- `pnpm --filter @compass/database run postgres:down`
- `pnpm --filter @compass/database run migrate:up`

## Admin-only tooling

Bootstrap and deployment recovery scripts are intentionally not part of normal feature development. Use the scripts in `platform/scripts/bootstrap` and `platform/scripts/infra` only when you are operating the platform.
