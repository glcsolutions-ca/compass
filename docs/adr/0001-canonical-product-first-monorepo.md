# ADR 0001: Canonical Product-First Monorepo

## Status

Accepted

## Decision

Compass uses a product-first monorepo with three first-class product surfaces:

- `apps/api`
- `apps/web`
- `apps/desktop`

Shared product code lives in `packages/*`. Delivery and infrastructure code lives in `platform/*`.

The public API uses resource-oriented naming:

- `/v1/threads/*`
- `/v1/runtime/*`

Legacy route families, transitional package names, and compatibility shims are not part of the canonical architecture.

## Rationale

- Product code is easier to navigate when the top-level repo map matches the shipped surfaces.
- Shared packages reduce duplication without hiding ownership.
- Separating `platform/*` from product code prevents delivery concerns from bleeding into runtime behavior.
- Resource-oriented API names are clearer than the previous agent-prefixed transport naming.
- Distinct CI gates keep deploy-surface verification fast without lowering product quality expectations.

## Consequences

- New features should land in `client-app`, `api`, or a clearly owned shared package, not in ad hoc host-specific folders.
- Deprecated package names and path aliases should be removed rather than preserved behind compatibility layers.
- Pipeline and bootstrap documentation must reference only canonical repo paths.
- Breaking API renames happen as explicit cutovers instead of indefinite dual support.
