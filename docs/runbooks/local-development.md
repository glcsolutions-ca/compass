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
- `pnpm dev:desktop`
- `pnpm test:integration`
- `pnpm test:acceptance`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm format`
- `pnpm format:check`
- `pnpm infra:whatif`

`pnpm dev` is the default browser-hosted local experience. It brings up the required local stack and
opens the web app once it is healthy.

Use `pnpm dev -- --no-open` when you want the same startup flow without opening a browser tab.

`pnpm test:integration` and `pnpm test:acceptance*` follow the same model. They bring up the
required local services from a cold state, reuse a healthy `pnpm dev:up` stack when one already
exists, and tear down only the infrastructure they started.

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
- `pnpm test:integration` and `pnpm test:acceptance*` are self-sufficient workflow commands
- pipeline and infra validation stays under `platform/`

## Local database helpers

- `pnpm --filter @compass/database run postgres:up`
- `pnpm --filter @compass/database run postgres:down`
- `pnpm --filter @compass/database run migrate:up`

## Advanced local stack controls

- `pnpm dev:up` starts the shared local stack in the background.
- `pnpm dev:down` stops the background local stack.

Rule of thumb:

- use `pnpm dev`, `pnpm test:integration`, and `pnpm test:acceptance:*` for normal day-to-day work
- use `pnpm dev:up` and `pnpm dev:down` when you want to chain several workflows against the same
  background stack

## Admin-only tooling

Bootstrap and deployment recovery scripts are intentionally not part of normal feature development. Use the root `scripts/` directory for daily developer commands, and the scripts in `platform/scripts/bootstrap` and `platform/scripts/infra` only when you are operating the platform.
