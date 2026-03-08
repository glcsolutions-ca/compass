# Local Development

Compass is a product-first monorepo. Local development should start from the product surfaces and only drop into platform tooling when you are working on delivery or infrastructure.

## Product surfaces

- `apps/api`: Express API for auth, workspaces, threads, and runtime endpoints
- `apps/web`: React Router web host
- `apps/web/app`: frontend routes, screens, loaders, and feature logic
- `apps/desktop`: Electron host for the web product shell

## Core commands

- `pnpm install`
- `pnpm dev`
- `pnpm test`
- `pnpm build`
- `pnpm test:acceptance`
- `pnpm infra:whatif`

## Package boundaries

- keep product logic in `apps/*` and `packages/*`
- keep shared UI in `packages/ui`
- keep HTTP contracts in `packages/contracts`
- keep generated clients in `packages/sdk`
- keep migrations and local postgres helpers in `packages/database`
- keep reusable test helpers in `packages/testkit`
- keep delivery and infra code in `platform/*`

## Testing model

- colocated unit tests live beside source as `*.test.ts(x)`
- black-box acceptance tests live under `tests/acceptance/{api,web,desktop}`
- `pnpm test` is the common fast local gate and is installed as a `pre-push` hook
- pipeline and infra validation stays under `platform/`

## Local database helpers

- `pnpm --filter @compass/database run postgres:up`
- `pnpm --filter @compass/database run postgres:down`
- `pnpm --filter @compass/database run migrate:up`

## Admin-only tooling

Bootstrap and deployment recovery scripts are intentionally not part of normal feature development. Use the scripts in `platform/scripts/bootstrap` and `platform/scripts/infra` only when you are operating the platform.
