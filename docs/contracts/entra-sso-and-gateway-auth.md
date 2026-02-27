# Entra SSO and App Auth Contracts

This document records the v1 Entra-only auth contract for Compass API and web entry flows.

## Scope

- API auth endpoints in `apps/api`
- Tenant membership and invite endpoints in `apps/api`
- Web front-door and workspace routes in `apps/web`
- OpenAPI + SDK contract generation in `packages/contracts` and `packages/sdk`

## Web Contract

Routes:

- `GET /`
- `GET /login`
- `GET /chat`
- `GET /workspaces`

Expected behavior:

- `/` redirects to `/chat` for authenticated users and `/login` for unauthenticated users.
- `/login` renders “Sign in with Microsoft” and redirects authenticated users to `/chat`.
- `/chat` is available for any authenticated user because auth auto-provisions a personal workspace membership when needed.
- `/workspaces` provides optional workspace management and invite flows.

## Auth API Contract

Routes:

- `GET /v1/auth/entra/start?returnTo=...`
- `GET /v1/auth/entra/callback`
- `GET /v1/auth/entra/admin-consent/start?tenantHint=...&returnTo=...`
- `GET /v1/auth/me`
- `POST /v1/auth/logout`

Behavior:

- Start route generates `state`, `nonce`, and PKCE verifier/challenge and persists short-lived request state.
- Callback route validates state, exchanges code, validates ID token, links/creates user identity, and issues session cookie.
- Successful callback defaults to `/chat` when `returnTo` is absent or legacy tenant-scoped.
- Successful login and `/v1/auth/me` reads enforce personal workspace auto-provisioning, ensuring at least one active membership.
- Callback route enforces optional Entra tenant allow-listing (`ENTRA_ALLOWED_TENANT_IDS`).
- Session cookie is `__Host-compass_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
- Auth endpoints are rate limited per client IP.
- Cookie-authenticated state-changing endpoints enforce same-origin CSRF checks using `Origin`/`Referer`.

## Tenant and Invite API Contract

Routes:

- `POST /v1/tenants`
- `GET /v1/tenants/:tenantSlug`
- `GET /v1/tenants/:tenantSlug/members`
- `POST /v1/tenants/:tenantSlug/invites`
- `POST /v1/tenants/:tenantSlug/invites/:token/accept`

Behavior:

- Tenant context comes from URL slug only.
- Membership checks are server-side and default deny.
- Invite creation is restricted to `owner`/`admin` roles.
- Invite acceptance validates token, expiry, and authenticated email match.

## OpenAPI Metadata Contract

`packages/contracts/openapi/openapi.json` includes:

- all routes listed above
- `sessionCookieAuth` security scheme (cookie `__Host-compass_session`)
- operation-level security for protected routes (`/v1/auth/me`, `/v1/auth/logout`, `/v1/tenants/**`)

Validation command:

- `pnpm contract:check`

## API Auth Identity Rules

- Entra identity linkage is immutable and based on `tid + oid`.
- Authorization decisions do not rely on mutable claims (`email`, `upn`, `name`).
