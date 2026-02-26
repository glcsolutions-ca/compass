# TDR-005: Entra-Only Auth V1 Baseline

## Status

Accepted

## Date

2026-02-26

## Context

Compass is prelaunch with no production users. Existing auth schema and behavior were inherited from prior prototypes and do not match the intended v1 product shape.

V1 requires:

- Microsoft Entra ID only authentication
- single multi-tenant Entra app registration owned by GLC
- path-scoped tenant context (`/t/<tenantSlug>/...`)
- JIT user provisioning based on immutable Entra claims (`tid` + `oid`)
- simple system-role membership model (`owner|admin|member|viewer`)

## Decision

Adopt an Entra-only auth baseline for v1 and replace the auth schema baseline migration with a minimal data model:

- `tenants`
- `users`
- `identities`
- `memberships`
- `invites`
- `auth_oidc_requests`
- `auth_sessions`
- `auth_audit_events`

The API will expose:

- Entra login start/callback/admin-consent routes
- session introspection and logout routes
- tenant creation/read/member listing
- tenant invite create/accept

Non-auth runtime tables (`codex_*`, `runtime_events`) remain unchanged.

## Consequences

Positive:

- reduced v1 complexity and lower implementation risk
- clear tenant boundary model from day one
- auth behavior aligns with Entra enterprise controls and consent onboarding
- straightforward extension path for custom roles and SCIM in later migrations

Tradeoffs:

- local auth and local MFA are intentionally unavailable in v1
- SCIM provisioning is deferred to a follow-up milestone
- baseline migration replacement is destructive to prior prototype data

## Rollout Notes

- Run destructive reset before rollout in prelaunch environments.
- Regenerate migration checksums in lockstep with baseline migration replacement.
- Verify `commit-stage` and `integration-gate` after each checkpoint merge to `main`.
