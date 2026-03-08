# Repository Boundaries

Compass is organized as a product-first monorepo.

## Product surfaces

- `apps/api`: the only HTTP and websocket control plane
- `apps/web`: browser host and owner of the React Router product app under `apps/web/app`
- `apps/desktop`: Electron host for the web product shell

## Shared packages

- `packages/ui`: reusable UI primitives
- `packages/contracts`: external API schemas and OpenAPI generation
- `packages/sdk`: generated client surface derived from contracts
- `packages/database`: migrations, local Postgres runtime, and seed scripts
- `packages/runtime-agent`: runtime host process implementations
- `packages/runtime-protocol`: runtime message contracts
- `packages/testkit`: reusable test helpers and isolation guardrails

## Platform namespace

- `platform/infra`: deployment infrastructure
- `platform/pipeline`: delivery policy, evidence, and release-candidate tooling
- `platform/scripts`: bootstrap, infra helpers, and local development scripts

Platform code never owns product business logic.

## Dependency rules

- `apps/web` owns its app code directly under `apps/web/app`.
- `apps/desktop` hosts the web product shell and should stay limited to Electron shell concerns.
- `packages/sdk` depends on generated contracts only.
- `apps/web/app` may depend on `ui`, `contracts`, and `sdk`, but not on platform code.
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
