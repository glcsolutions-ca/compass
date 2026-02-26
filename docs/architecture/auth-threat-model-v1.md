# Auth Threat Model V1 (Entra-Only)

## Scope

In scope:

- `/v1/auth/entra/start`
- `/v1/auth/entra/callback`
- `/v1/auth/me`
- `/v1/auth/logout`
- `/v1/tenants/**` membership and invite endpoints
- server-side session creation, validation, and revocation

Out of scope:

- local password auth
- local MFA factors
- SCIM provisioning
- resource-level sharing ACL

## Assets

- user identity linkage (`identities` with `tid` + `oid`)
- tenant membership and role assignments
- session token secrets and session state
- invite tokens
- auth audit event integrity

## Trust Boundaries

- browser to API boundary (untrusted client)
- API to Entra boundary (OIDC token exchange and JWKS)
- API to Postgres boundary (persistent auth state)

## Primary Threats And Mitigations

1. OAuth authorization code interception

- Mitigation: authorization code flow with PKCE (`S256`), short-lived state, single-use state consumption, encrypted PKCE verifier at rest.

2. Callback CSRF and replay

- Mitigation: unguessable `state`, strict callback state lookup, single-use state records with TTL, hashed nonce validation.

3. ID token forgery or claim substitution

- Mitigation: JWKS signature validation, `aud` validation, issuer check tied to `tid`, nonce validation.

4. Tenant confusion / horizontal privilege escalation

- Mitigation: tenant context sourced from URL slug only, server-side membership check on tenant routes, default deny for non-members.

5. Session theft persistence

- Mitigation: opaque random session tokens, token hash at rest, revocation on logout, expiry and idle timeout checks.

6. Cross-site request forgery on state-changing endpoints

- Mitigation: require same-origin `Origin`/`Referer` for cookie-authenticated non-GET requests; deny cross-origin requests.

7. Invite token abuse

- Mitigation: token hash at rest, expiry enforcement, email match validation against authenticated identity, strict single-use acceptance with cross-user replay rejection.

8. Account-link hijack via mutable claims

- Mitigation: use immutable Entra subject (`tid` + `oid`) for linkage and authorization identity; do not authorize from email/upn/name.

9. Authentication endpoint abuse/brute force noise

- Mitigation: in-memory per-IP auth endpoint rate limits for Entra start/callback/admin-consent entry points.
- Additional hardening: process-local limiter includes stale-entry pruning and max key cardinality cap to avoid unbounded memory growth.

## Residual Risks

- No per-endpoint adaptive risk signals in v1.
- Rate limiting is process-local (not globally distributed across replicas).
- No SCIM deprovisioning in v1; membership lifecycle remains app-managed.
- No WebAuthn or phishing-resistant step-up in v1.

## Detection

Audit events emitted for:

- login success/failure
- tenant create
- invite create/accept

These events support incident triage and forensics in prelaunch and production.
