# TDR-006: Frontend Constitution v1

## Status

Accepted

## Date

2026-02-26

## Context

The web frontend was functional but lacked a durable, enforced implementation standard for architecture, theming, and UI consistency.
This created risk of ad-hoc patterns, one-off primitives, and inconsistent route/data behavior as the product grows.

## Decision

Adopt a frontend constitution for `apps/web` with the following mandatory baseline:

1. React Router data APIs (`clientLoader`/`clientAction`) as canonical server-state orchestration.
2. `@compass/sdk` as the only Compass API access path from routes/components.
3. shadcn + Radix primitive UI policy.
4. Tailwind + shadcn CSS variables with first-class light/dark mode.
5. Persistent authenticated shell with bottom-right profile/workspace switcher.
6. URL-first workspace context authority (`/t/:tenantSlug/*`).
7. Route-first capsule folder structure.
8. Commit-stage constitution policy checks (fail-closed).

## Consequences

### Positive

- Enforced consistency for UI and data behavior.
- Lower long-term maintenance cost and fewer bespoke workaround patterns.
- Faster onboarding through deterministic route/module structure.
- Stable foundation for chat-first UX evolution.

### Tradeoffs

- Initial rewrite cost and stricter guardrails reduce short-term flexibility.
- New routes require capsule structure even for small features.
- Additional quick-gate checks add a small local validation overhead.

## Implementation Notes

- Normative architecture doc: `docs/architecture/frontend-constitution.md`
- Guardrail script: `scripts/pipeline/commit/check-web-constitution.mjs`
- Quick gate wiring: root `package.json` `test:quick`
- Route surface v1: `/login`, `/workspaces`, `/t/:tenantSlug/chat`
