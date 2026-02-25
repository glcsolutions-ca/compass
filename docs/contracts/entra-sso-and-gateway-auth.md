# Entra SSO and Gateway Auth Contracts

This document records the external auth contract behavior introduced for web
front-door SSO and gateway auth route typing.

## Scope

- `apps/web` Entra SSO login and callback routes.
- `apps/web` proxy enforcement of enterprise SSO session cookie.
- `packages/contracts` typed auth request/response schemas for codex gateway.
- `apps/api` permission claim handling for Entra tokens that include scopes,
  roles, or both.

## Web SSO Contract

### New routes

- `GET /login`
- `GET /api/auth/entra/start`
- `GET /api/auth/entra/callback`
- `POST /api/auth/entra/logout`

### Start route

- Generates `state`, `nonce`, and PKCE verifier/challenge.
- Stores transient OIDC state in secure `HttpOnly` cookie with short TTL.
- Redirects to the Microsoft Entra authorize endpoint for
  `response_type=code`.

### Callback route

- Validates query `state` against transient cookie state.
- Exchanges authorization code at token endpoint.
- Validates ID token issuer, audience, nonce, expiry, and tenant.
- Enforces configured tenant allow-list.
- Issues `__Host-compass_sso` secure `HttpOnly` cookie with minimal identity
  claims and expiry.

### Logout route

- Clears `__Host-compass_sso`.
- Redirects to `/login`.

## Proxy Enforcement Contract

`apps/web` route proxy (`/api/v1/*`) enforces valid `__Host-compass_sso` when
`ENTRA_LOGIN_ENABLED=true`, except for explicitly public/health routes.

Behavior:

- Missing or invalid SSO cookie for protected paths: `401`.
- Valid SSO cookie: request continues to existing provider auth flow.
- Dev fallback is only valid when enabled via configuration and non-production
  runtime.

## Gateway Auth Schemas

`packages/contracts/src/codex-gateway.ts` now defines explicit auth schemas:

- `AuthModeSchema` and `KnownAuthModeSchema`.
- `AuthAccountSchema`.
- `AuthLoginStartResponseSchema`.
- `AuthAccountReadResponseSchema`.

This removes `unknown`-shaped auth payloads and standardizes runtime parsing for
gateway route handlers.

## Contract Verification Command

Use the root contract verification command to validate generated OpenAPI and SDK
schema artifacts are in sync:

- `pnpm contract:check`

## API Permission Claims

API auth token verification now accepts Entra access tokens with:

- `scp` only
- `roles` only
- both `scp` and `roles`

Permission checks evaluate merged claim grants per endpoint requirements instead
of rejecting mixed-claim tokens.
