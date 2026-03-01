# Frontend Constitution

Purpose: required rules for web UI architecture and styling consistency.

## Scope

- route/module boundaries
- component and styling conventions
- state/data loading patterns

## Rules

- follow repository route and import boundaries
- use shared UI primitives and tokens
- keep behavior deterministic and testable
- enforce constitution checks in quick gate

## Validation

- run `pnpm test:quick`
- fix constitution policy failures before merge

## Source

- `scripts/pipeline/commit/check-web-constitution.mjs`
- `apps/web/**`
