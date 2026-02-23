# API App

## Purpose

`apps/api` is the Fastify backend service for Compass system endpoints and data-layer runtime wiring.

## Endpoints

- `GET /health`
- `GET /openapi.json`

## Config Env Table

Configuration is parsed in `src/config/index.ts`.

| Env Var                      | Default       | Notes                                                                  |
| ---------------------------- | ------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`                   | `development` | Allowed: `development`, `test`, `production`.                          |
| `API_PORT`                   | `3001`        | Listening port.                                                        |
| `API_HOST`                   | `0.0.0.0`     | Listening host.                                                        |
| `LOG_LEVEL`                  | `info`        | Allowed: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. |
| `DATABASE_URL`               | unset         | Optional; enables Postgres plugin when provided.                       |
| `DB_POOL_MAX`                | `10`          | Postgres pool max clients.                                             |
| `DB_IDLE_TIMEOUT_MS`         | `10000`       | Postgres pool idle timeout.                                            |
| `DB_CONNECTION_TIMEOUT_MS`   | `2000`        | Postgres connect timeout.                                              |
| `DB_SSL_MODE`                | `disable`     | Allowed: `disable`, `require`.                                         |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true`        | Parsed as boolean string `true`/`false`.                               |

## DB Optionality

- If `DATABASE_URL` is unset, the API starts without Postgres plugin registration.
- If `DATABASE_URL` is set, Postgres pool configuration and SSL behavior are applied from env.
- Local template is `apps/api/.env.example`.

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
- Integration tests: `apps/api/test/integration/**/*.test.ts`
