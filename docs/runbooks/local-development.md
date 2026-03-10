# Local Development

Compass is a product-first monorepo. Use the product surfaces first and only drop into platform tooling when you are working on delivery or infrastructure.

## Product surfaces

- `apps/api`: Express API for auth, workspaces, threads, and runtime endpoints
- `apps/web`: React Router web host
- `apps/web/app`: frontend routes, screens, loaders, and feature logic
- `apps/desktop`: Electron host for the web product shell

## Daily commands

- `pnpm install`
- `pnpm dev`
- `pnpm verify`
- `pnpm acceptance`

`pnpm dev` is the fast local source-mode loop. `pnpm verify` is the authoritative local Commit Stage. `pnpm acceptance` runs the local Acceptance Stage against the locally built candidate.

## Focused commands

- `pnpm --filter @compass/web test`
- `pnpm --filter @compass/api test`
- `pnpm --filter @compass/api test:integration`
- `pnpm acceptance:desktop`
- `pnpm dev:desktop`
- `pnpm infra:whatif`

## Testing model

- colocated unit tests live beside source as `*.test.ts(x)`
- colocated integration tests live beside source as `*.integration.test.ts`
- black-box acceptance tests live under `tests/acceptance/{api,web,desktop}`
- the required CDP Acceptance Stage currently runs `api` and `web` only
- desktop acceptance remains black-box but sits outside the required CDP path until desktop has a first-class release path

## Git integration rules

- the blocking `pre-push` hook runs `pnpm verify`
- the `pre-push` hook also blocks branches behind `origin/main`
- rebasing is explicit: `git fetch origin && git rebase origin/main && pnpm verify`
- no hook rewrites history automatically

## Local database helpers

- `pnpm --filter @compass/database run postgres:up`
- `pnpm --filter @compass/database run postgres:down`
- `pnpm --filter @compass/database run migrate:up`

## Advanced local stack controls

- `pnpm dev:up` starts the shared local stack in the background
- `pnpm dev:down` stops the background local stack

Rule of thumb:

- use `pnpm dev` for the fast local loop
- use `pnpm verify` and `pnpm acceptance` for the production-shaped path
- use `pnpm dev:up` and `pnpm dev:down` only when you explicitly want a long-lived background stack

## Admin-only tooling

Bootstrap and deployment recovery scripts are intentionally not part of normal feature development. Use the root `scripts/` directory for developer entrypoints and `platform/scripts/bootstrap` or `platform/scripts/infra` only when operating the platform.
