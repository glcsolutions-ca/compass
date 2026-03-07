# Repository Boundaries

Compass is organized as a product-first monorepo.

## Product surfaces

- `apps/api`: the only HTTP and websocket control plane
- `apps/web`: browser host for the shared product shell
- `apps/desktop`: Electron host for the shared product shell

## Shared packages

- `packages/app-shell`: shared feature shell for web and desktop
- `packages/ui`: reusable UI primitives
- `packages/contracts`: external API schemas and OpenAPI generation
- `packages/sdk`: generated client surface derived from contracts
- `packages/database`: migrations, local Postgres runtime, and seed scripts
- `packages/runtime-agent`: runtime host process implementations
- `packages/runtime-protocol`: runtime message contracts
- `packages/shared`: cross-package utilities with no product ownership
- `packages/testing`: reusable test helpers

## Platform namespace

- `platform/infra`: deployment infrastructure
- `platform/pipeline`: delivery policy, evidence, and release-candidate tooling
- `platform/scripts`: bootstrap, infra helpers, and local development scripts

Platform code never owns product business logic.

## Dependency rules

- `apps/web` and `apps/desktop` depend on `packages/app-shell`, not on each other.
- `packages/sdk` depends on generated contracts only.
- `packages/app-shell` may depend on `ui`, `shared`, `contracts`, and `sdk`, but not on platform code.
- `apps/api` owns transport and orchestration; runtime host adapters live under `apps/api/src/infrastructure`.
- `platform/*` may automate product surfaces, but product code must not import `platform/*`.

## Public API naming

- Thread resources live under `/v1/threads/*`.
- Runtime resources live under `/v1/runtime/*`.
- User-facing browser URLs remain workspace-oriented and separate from the API surface.

## CI ownership

- `check:product` validates all first-class product packages.
- `check:commit` validates the deployable cloud surface: `api`, `web`, `database`, `contracts`, and `sdk`.
- `check:pipeline` validates delivery policy, infrastructure templates, and legacy-reference guards.
