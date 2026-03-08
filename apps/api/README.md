# API App

Purpose: contract-backed HTTP API for auth, workspaces, threads, and runtime endpoints.

## Source layout

- `apps/api/src/bootstrap`: process startup and composition
- `apps/api/src/http`: Express app construction, middleware, and route registration
- `apps/api/src/modules`: feature modules
- `apps/api/src/infrastructure`: database and runtime-host adapters

## Test layout

- colocated unit tests under `apps/api/src/**/*.test.ts`
- integration tests under `apps/api/test/integration`

## Run and verify

```bash
pnpm --filter @compass/api dev
pnpm --filter @compass/api test
pnpm --filter @compass/api test:integration
pnpm --filter @compass/api typecheck
```

## Contract source of truth

- `packages/contracts/src/openapi/**`
- `packages/contracts/openapi/openapi.json`
