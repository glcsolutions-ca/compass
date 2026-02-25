# API App

## Purpose

`apps/api` is the Express 5 backend service for Compass system endpoints.
It serves health and ping APIs and publishes OpenAPI from `@compass/contracts`.

## Endpoints

- `GET /health`
- `GET /openapi.json`
- `GET /v1/ping`

## Config Env Table

Configuration is parsed in `src/config.ts`.

| Env Var     | Default   | Notes                                      |
| ----------- | --------- | ------------------------------------------ |
| `API_HOST`  | `0.0.0.0` | Listening host (trimmed).                  |
| `API_PORT`  | `3001`    | Listening port; must be integer `1-65535`. |
| `LOG_LEVEL` | `info`    | Log level string (trimmed).                |

Local template: `apps/api/.env.example`.

## Contract and OpenAPI Notes

- `buildApiApp` generates OpenAPI via `buildOpenApiDocument()` from `@compass/contracts`.
- `GET /openapi.json` should include `/health` and `/v1/ping` path operations.

## Commands

Exact local commands from `apps/api/package.json`:

- `pnpm --filter @compass/api dev`
- `pnpm --filter @compass/api build`
- `pnpm --filter @compass/api start`
- `pnpm --filter @compass/api lint`
- `pnpm --filter @compass/api test`
- `pnpm --filter @compass/api test:integration`
- `pnpm --filter @compass/api typecheck`

## Test Layers

- Unit/component tests: `apps/api/src/**/*.test.ts`
- Integration smoke tests: `apps/api/test/integration/**/*.test.ts`
