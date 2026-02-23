# Foundation Baseline

## Purpose

Define the minimal, domain-neutral platform baseline before product-specific API routes,
database schema, and UI flows are finalized.

## Baseline Rules

- Keep runtime surfaces system-only by default.
- Avoid hardcoded product entities, IDs, and route names in core code paths.
- Keep infrastructure primitives in place (API service, web proxy, worker loop, DB tooling).
- Add product-domain behavior only after a concrete feature spec exists.

## Current Baseline

- API exposes `GET /health` and `GET /openapi.json`.
- OpenAPI documents only system endpoints.
- Web root renders a minimal foundation shell.
- Web keeps a generic `/api/v1/*` proxy boundary.
- Worker processes a generic event envelope contract.
- DB migration/seed framework is active, but no domain schema is seeded by default.

## Extension Guidance

When adding the first real feature:

1. Define schema first (contracts + DB migration).
2. Add API route with tests and OpenAPI updates.
3. Add web flow that consumes the route through the proxy.
4. Add or adjust worker/event processing only if required.
5. Update smoke checks for the new explicit behavior.
