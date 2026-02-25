# Web App

## Purpose

`apps/web` is the Next.js frontend and same-origin proxy surface for API calls.

## UI Structure

- `src/app/(auth)` holds public auth routes (`/login`) and UI-only auth helpers.
- `src/app/(app)` holds authenticated app routes (`/` currently serves the core shell).
- `src/app/_lib/server` holds server-only app utilities shared across routes.
- `src/app/api` holds route handlers for auth and API proxy behavior.

## API Proxy Contract

The route handler at `src/app/api/v1/[...path]/route.ts` proxies browser requests to the API:

- forwards only allowlisted request headers
- strips hop-by-hop headers on request and response
- injects upstream bearer token from a signed `__Host-compass_session` cookie (BFF pattern)
- requires CSRF token + origin/referer validation on mutating requests
- enforces step-up marker for high-risk role/scim mutations
- enforces enterprise SSO (`__Host-compass_sso`) when `ENTRA_LOGIN_ENABLED=true`
- uses a bounded upstream timeout (`10_000ms`)
- returns `500` with `API_BASE_URL_REQUIRED` if `API_BASE_URL` is missing in production
- returns `502` with `UPSTREAM_UNAVAILABLE` when upstream fetch fails

Proxy target rules:

- In `development`/`test`, default target is `http://localhost:3001` when `API_BASE_URL` is unset.
- In `production`, `API_BASE_URL` must be provided.
- Proxied API destination is `/v1/*` on the upstream API service.

## Entra Login Flow

- `GET /login` is the enterprise login page.
- `GET /api/auth/entra/start` begins Microsoft Entra authorization code + PKCE.
- `GET /api/auth/entra/callback` exchanges code, validates ID token, and writes `__Host-compass_sso`.
- `POST /api/auth/entra/logout` clears `__Host-compass_sso` and redirects to `/login`.

## Env Table

| Env Var                          | Default                                 | Notes                                                                                             |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `API_BASE_URL`                   | `http://localhost:3001` (dev/test only) | Runtime proxy target for `/api/v1/*`; required in production.                                     |
| `WEB_SESSION_SECRET`             | dev/test default                        | Required in production; signs/verifies host-only BFF session cookie.                              |
| `WEB_ALLOWED_ORIGINS`            | unset                                   | Optional comma-separated allowlist for origin/referer checks on mutating proxy calls.             |
| `ENTRA_LOGIN_ENABLED`            | `false`                                 | Enables enterprise SSO gate and `/login` flow.                                                    |
| `WEB_BASE_URL`                   | unset                                   | Canonical web origin; Entra callback URI is derived as `${WEB_BASE_URL}/api/auth/entra/callback`. |
| `ENTRA_CLIENT_ID`                | unset                                   | Entra app registration client ID.                                                                 |
| `ENTRA_CLIENT_SECRET`            | unset                                   | Entra app registration client secret used at token exchange.                                      |
| `ENTRA_ALLOWED_TENANT_IDS`       | unset                                   | Comma-separated allowlist of tenant IDs for multi-tenant org sign-in.                             |
| `ENTRA_JWKS_JSON`                | unset                                   | Optional JSON JWKS override (primarily for deterministic tests/offline validation).               |
| `AUTH_DEV_FALLBACK_ENABLED`      | `false`                                 | Non-production only; bypasses enterprise SSO gate for local/dev fallback.                         |
| `NEXT_PUBLIC_CODEX_API_BASE_URL` | `http://localhost:3010`                 | Browser-side base URL for direct codex gateway HTTP calls.                                        |
| `NEXT_PUBLIC_CODEX_WS_BASE_URL`  | `ws://localhost:3010`                   | Browser-side base URL for direct codex gateway websocket stream.                                  |

Local template: `apps/web/.env.local.example`.

## Next Standalone Build Notes

- `next.config.ts` sets `output: "standalone"`.
- `next.config.ts` sets `eslint.ignoreDuringBuilds=true` because lint is enforced in CI.
- `next.config.ts` transpiles `@compass/sdk`.
- Standalone entrypoint command is `start:standalone`.

## Commands

Exact local commands from `apps/web/package.json`:

- `pnpm --filter @compass/web dev`
- `pnpm --filter @compass/web build`
- `pnpm --filter @compass/web start`
- `pnpm --filter @compass/web start:standalone`
- `pnpm --filter @compass/web lint`
- `pnpm --filter @compass/web test`
- `pnpm --filter @compass/web typecheck`
