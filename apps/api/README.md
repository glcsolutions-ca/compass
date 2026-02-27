# API App

## Purpose

`apps/api` is the Express 5 backend service for Compass system and auth endpoints.
It serves health/ping plus Entra-first auth and tenant membership APIs, and publishes OpenAPI from `@compass/contracts`.

Runtime migrations expect the canonical single baseline file `db/migrations/1772083000000_initial_schema.mjs`.

## Endpoints

- `GET /health`
- `GET /openapi.json`
- `GET /v1/ping`
- `GET /v1/auth/entra/start`
- `GET /v1/auth/entra/callback`
- `GET /v1/auth/entra/admin-consent/start`
- `GET /v1/auth/me`
- `POST /v1/auth/logout`
- `POST /v1/tenants`
- `GET /v1/tenants/:tenantSlug`
- `GET /v1/tenants/:tenantSlug/members`
- `POST /v1/tenants/:tenantSlug/invites`
- `POST /v1/tenants/:tenantSlug/invites/:token/accept`

## Config Env Table

Configuration is parsed in `src/config.ts`.

| Env Var                         | Default                                  | Notes                                                            |
| ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `API_HOST`                      | `0.0.0.0`                                | Listening host (trimmed).                                        |
| `API_PORT`                      | `3001`                                   | Listening port; decimal integer `1-65535`.                       |
| `LOG_LEVEL`                     | `info`                                   | Log level string (trimmed, normalized).                          |
| `DATABASE_URL`                  | unset                                    | Required for auth/tenant persistence routes.                     |
| `WEB_BASE_URL`                  | `http://localhost:3000`                  | Public web origin used for OIDC redirect defaults.               |
| `ENTRA_LOGIN_ENABLED`           | `false`                                  | Set `true` to enable Entra login routes.                         |
| `ENTRA_CLIENT_ID`               | unset                                    | Entra multi-tenant application client id.                        |
| `ENTRA_CLIENT_SECRET`           | unset                                    | Entra app client secret.                                         |
| `ENTRA_REDIRECT_URI`            | `${WEB_BASE_URL}/v1/auth/entra/callback` | Explicit redirect URI override.                                  |
| `ENTRA_AUTHORITY_HOST`          | `https://login.microsoftonline.com`      | Entra authority host.                                            |
| `ENTRA_TENANT_SEGMENT`          | `organizations`                          | Entra tenant segment (`organizations` for work/school accounts). |
| `ENTRA_ALLOWED_TENANT_IDS`      | empty                                    | Optional comma-separated Entra tenant IDs allow-list.            |
| `ENTRA_SCOPE`                   | `openid profile email`                   | OIDC scope set.                                                  |
| `AUTH_SESSION_TTL_SECONDS`      | `28800`                                  | Absolute session max age.                                        |
| `AUTH_SESSION_IDLE_TTL_SECONDS` | `3600`                                   | Idle timeout; stale sessions are revoked.                        |
| `AUTH_RATE_LIMIT_WINDOW_MS`     | `60000`                                  | Auth endpoint rate-limit rolling window.                         |
| `AUTH_RATE_LIMIT_MAX_REQUESTS`  | `30`                                     | Max auth endpoint requests per IP/window.                        |

Local template: `apps/api/.env.example`.

## Contract and OpenAPI Notes

- `buildApiApp` generates OpenAPI via `buildOpenApiDocument()` from `@compass/contracts`.
- `GET /openapi.json` should include `/health`, `/v1/ping`, auth, and tenant path operations.
- Unknown routes return JSON `404` with `{ code, message }`.
- Malformed JSON request bodies return JSON `400` with `{ code, message }`.
- Auth entry endpoints are rate limited per client IP (`429 RATE_LIMITED`).
- Cookie-authenticated non-GET requests require same-origin `Origin`/`Referer` (`CSRF_ORIGIN_REQUIRED`/`CSRF_ORIGIN_DENIED`).

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
