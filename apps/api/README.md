# API App

## Purpose

`apps/api` is the Fastify backend service for Compass system endpoints, Entra-backed authn/authz,
tenant RBAC, and SCIM provisioning.

## Endpoints

- `GET /health`
- `GET /openapi.json`
- `GET /v1/me`
- `GET /v1/me/permissions`
- `GET /v1/tenants/:tenantId/roles`
- `POST /v1/tenants/:tenantId/roles`
- `POST /v1/oauth/token`
- `POST /scim/v2/Users`
- `PUT /scim/v2/Users/:id`
- `POST /scim/v2/Groups`
- `PUT /scim/v2/Groups/:id`

## Config Env Table

Configuration is parsed in `src/config/index.ts`.

| Env Var                      | Default                       | Notes                                                                   |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `NODE_ENV`                   | `development`                 | Allowed: `development`, `test`, `production`.                           |
| `API_PORT`                   | `3001`                        | Listening port.                                                         |
| `API_HOST`                   | `0.0.0.0`                     | Listening host.                                                         |
| `LOG_LEVEL`                  | `info`                        | Allowed: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`.  |
| `DATABASE_URL`               | unset                         | Optional; enables Postgres plugin when provided.                        |
| `DB_POOL_MAX`                | `10`                          | Postgres pool max clients.                                              |
| `DB_IDLE_TIMEOUT_MS`         | `10000`                       | Postgres pool idle timeout.                                             |
| `DB_CONNECTION_TIMEOUT_MS`   | `2000`                        | Postgres connect timeout.                                               |
| `DB_SSL_MODE`                | `disable`                     | Allowed: `disable`, `require`.                                          |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true`                        | Parsed as boolean string `true`/`false`.                                |
| `AUTH_ISSUER`                | `https://compass.local/auth`  | Token issuer for access-token verification.                             |
| `AUTH_AUDIENCE`              | `api://compass-api`           | Expected API audience claim.                                            |
| `AUTH_JWKS_URI`              | unset                         | Required in production when local JWT secret is not used.               |
| `AUTH_LOCAL_JWT_SECRET`      | dev/test default              | Local HS256 verifier secret for non-production.                         |
| `AUTH_ACTIVE_TENANT_IDS`     | unset                         | Comma-separated strict safelist of active tenant IDs.                   |
| `AUTH_ALLOWED_CLIENT_IDS`    | unset                         | Optional comma-separated allowlist of actor client IDs.                 |
| `AUTH_ASSIGNMENTS_JSON`      | `[]`                          | Fallback in-memory role assignments when DB-backed auth data is absent. |
| `AUTH_SCIM_CLIENTS_JSON`     | `[]`                          | Fallback OAuth2 clients for SCIM client credentials.                    |
| `OAUTH_TOKEN_ISSUER`         | `https://compass.local/oauth` | Issuer for `/v1/oauth/token`.                                           |
| `OAUTH_TOKEN_AUDIENCE`       | `compass-scim`                | Audience for SCIM client-credentials tokens.                            |
| `OAUTH_TOKEN_SIGNING_SECRET` | dev/test default              | HS256 signing secret for Compass-issued OAuth tokens.                   |

## DB Optionality

- If `DATABASE_URL` is unset, the API starts without Postgres plugin registration.
- If `DATABASE_URL` is set, Postgres pool configuration and SSL behavior are applied from env.
- When auth tables are unavailable, strict auth checks still run using `AUTH_*` in-memory bootstrap config.
- Local template is `apps/api/.env.example`.

## Runtime Acceptance Note

- Browser and API/system candidate acceptance paths must inject the same auth bootstrap env (`AUTH_*` and `OAUTH_*`) so `/health` readiness is validated under the same production-mode config.

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
